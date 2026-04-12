/**
 * Unit tests for ai-bridge handlers: handleChatCore.
 * Uses Bun's native test runner. Mocks globalThis.fetch.
 */

import { describe, it, expect } from "bun:test";
import { handleChatCore } from "../../ai-bridge/handlers/chatCore.ts";
import type { BodyInit } from "bun";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("handleChatCore", () => {
  it("returns error for unknown provider", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      // Unknown provider falls through to default openai URL, then auth fails
      return Promise.resolve(new globalThis.Response("Unauthorized", { status: 401 }));
    }) as unknown as typeof globalThis.fetch;

    try {
      const result = await handleChatCore({
        body: { model: "unknown-model", messages: [{ role: "user", content: "hello" }] },
        modelInfo: { provider: "unknown_provider", model: "unknown-model" },
        credentials: {},
      });
      // Falls through to openai URL (default) → 401
      expect(result.success).toBe(false);
      expect(result.status ?? 0).toBeGreaterThanOrEqual(400);
      // Verify response field is now present
      expect(result.response).toBeDefined();
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("non-streaming: passes body to upstream and returns response", async () => {
    let capturedBody = "";
    const origFetch = globalThis.fetch;
    // Use "ollama" provider (OLLAMA format). Mock returns Ollama-format non-streaming response.
    // handleChatCore translates: request OPENAI→OLLAMA, response OLLAMA→OPENAI via convertOllamaResponseToOpenAINonStream.
    globalThis.fetch = ((_url: unknown, init?: RequestInit) => {
      // Body is Uint8Array, need to decode
      const rawBody = init?.body;
      if (rawBody instanceof Uint8Array) {
        capturedBody = new TextDecoder().decode(rawBody);
      } else {
        capturedBody = (rawBody as string) ?? "";
      }
      // Return non-streaming JSON response in Ollama format (what a real Ollama server returns).
      // handleChatCore will translate this to OpenAI format via convertOllamaResponseToOpenAINonStream.
      return Promise.resolve(
        new globalThis.Response(
          JSON.stringify({
            model: "llama3",
            message: { role: "assistant", content: "hello from ollama" },
            done: true,
            done_reason: "stop",
            total_duration: 1_000_000_000,
            prompt_eval_count: 5,
            eval_count: 4,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      );
    }) as unknown as typeof globalThis.fetch;

    try {
      const result = await handleChatCore({
        body: { model: "llama3", messages: [{ role: "user", content: "hi" }], stream: false },
        modelInfo: { provider: "ollama", model: "llama3" },
        credentials: { apiKey: "test-key" },
      });

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
      // Verify model was set in the body sent upstream
      expect(capturedBody).toContain("llama3");

      // Read the response body — should be translated to OpenAI format by convertOllamaResponseToOpenAINonStream
      const responseText = await result.response!.text();
      const parsed = JSON.parse(responseText);
      // OpenAI format uses choices[0].message.content
      expect(parsed.choices[0].message.content).toBe("hello from ollama");
      // Also verify OpenAI-specific fields
      expect(parsed.object).toBe("chat.completion");
      expect(parsed.choices[0].finish_reason).toBe("stop");
      // Usage should be mapped: prompt_eval_count → prompt_tokens, eval_count → completion_tokens
      expect(parsed.usage.prompt_tokens).toBe(5);
      expect(parsed.usage.completion_tokens).toBe(4);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("returns 502 on network failure", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("Connection refused");
    }) as unknown as typeof globalThis.fetch;

    try {
      const result = await handleChatCore({
        body: { model: "gpt-4o", messages: [{ role: "user", content: "hello" }] },
        modelInfo: { provider: "openai", model: "gpt-4o" },
        credentials: { apiKey: "test-key" },
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe(502);
      expect(result.error).toContain("Connection refused");
      // Verify response field is now present (fix for upstream error formatting)
      expect(result.response).toBeDefined();
      expect(result.response!.status).toBe(502);
      const body = await result.response!.text();
      const parsed = JSON.parse(body);
      expect(parsed.error).toBeDefined();
      expect(parsed.error.message).toContain("Connection refused");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("handles upstream 401 error", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      return Promise.resolve(new globalThis.Response("Invalid API key", { status: 401 }));
    }) as unknown as typeof globalThis.fetch;

    try {
      const result = await handleChatCore({
        body: { model: "gpt-4o", messages: [{ role: "user", content: "hello" }] },
        modelInfo: { provider: "openai", model: "gpt-4o" },
        credentials: { apiKey: "bad-key" },
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe(401);
      // Verify response field is now present
      expect(result.response).toBeDefined();
      expect(result.response!.status).toBe(401);
      const body = await result.response!.text();
      const parsed = JSON.parse(body);
      expect(parsed.error).toBeDefined();
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("handles upstream 429 rate limit", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      return Promise.resolve(new globalThis.Response("Rate limit exceeded", { status: 429 }));
    }) as unknown as typeof globalThis.fetch;

    try {
      const result = await handleChatCore({
        body: { model: "gpt-4o", messages: [{ role: "user", content: "hello" }] },
        modelInfo: { provider: "openai", model: "gpt-4o" },
        credentials: { apiKey: "test-key" },
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe(429);
      expect(result.error).toContain("Rate limited");
      // Verify response field is now present
      expect(result.response).toBeDefined();
      expect(result.response!.status).toBe(429);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("handles upstream 500 server error", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      return Promise.resolve(new globalThis.Response("Internal server error", { status: 500 }));
    }) as unknown as typeof globalThis.fetch;

    try {
      const result = await handleChatCore({
        body: { model: "gpt-4o", messages: [{ role: "user", content: "hello" }] },
        modelInfo: { provider: "openai", model: "gpt-4o" },
        credentials: { apiKey: "test-key" },
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe(500);
      // Verify response field is now present
      expect(result.response).toBeDefined();
      expect(result.response!.status).toBe(500);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("streaming: returns SSE response with text/event-stream content-type", async () => {
    const sseChunks = [
      'data: {"id":"chatcmpl_123","object":"chat.completion.chunk","model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n',
      'data: {"id":"chatcmpl_123","object":"chat.completion.chunk","model":"gpt-4o","choices":[{"index":0,"delta":{"content":"hi"},"finish_reason":null}]}\n\n',
      "data: [DONE]\n\n",
    ];

    const origFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      const body = new ReadableStream({
        start(controller) {
          let i = 0;
          const enqueue = () => {
            if (i < sseChunks.length) {
              controller.enqueue(new TextEncoder().encode(sseChunks[i++]));
              setTimeout(enqueue, 10);
            } else {
              controller.close();
            }
          };
          enqueue();
        },
      });
      return Promise.resolve(
        new globalThis.Response(body, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        })
      );
    }) as unknown as typeof globalThis.fetch;

    try {
      const result = await handleChatCore({
        body: { model: "gpt-4o", messages: [{ role: "user", content: "hi" }], stream: true },
        modelInfo: { provider: "openai", model: "gpt-4o" },
        credentials: { apiKey: "test-key" },
      });

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
      expect(result.response!.headers.get("Content-Type")).toBe("text/event-stream");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("streaming: translates Ollama NDJSON response to OpenAI SSE", async () => {
    // Ollama returns streaming NDJSON (not SSE). handleChatCore must translate OLLAMA→OPENAI.
    const ollamaChunks = [
      '{"model":"llama3","message":{"role":"assistant","content":""},"done":false}',
      '{"model":"llama3","message":{"role":"assistant","content":"Hello"},"done":false}',
      '{"model":"llama3","message":{"role":"assistant","content":" world"},"done":false}',
      '{"model":"llama3","done":true,"done_reason":"stop","prompt_eval_count":5,"eval_count":4}',
    ];

    const origFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      const body = new ReadableStream({
        start(controller) {
          let i = 0;
          const enqueue = () => {
            if (i < ollamaChunks.length) {
              controller.enqueue(new TextEncoder().encode(ollamaChunks[i++] + "\n"));
              setTimeout(enqueue, 5);
            } else {
              controller.close();
            }
          };
          enqueue();
        },
      });
      return Promise.resolve(
        new globalThis.Response(body, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    }) as unknown as typeof globalThis.fetch;

    try {
      const result = await handleChatCore({
        body: { model: "llama3", messages: [{ role: "user", content: "hi" }], stream: true },
        modelInfo: { provider: "ollama", model: "llama3" },
        credentials: { apiKey: "test-key" },
      });

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
      expect(result.response!.headers.get("Content-Type")).toBe("text/event-stream");

      // Collect streamed chunks
      const reader = result.response!.body!.getReader();
      const chunks: string[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(new TextDecoder().decode(value));
      }
      const full = chunks.join("");

      // Translated to OpenAI SSE format
      expect(full).toContain('"object":"chat.completion.chunk"');
      expect(full).toContain('"content":"Hello"');
      expect(full).toContain('"content":" world"');
      expect(full).toContain('"finish_reason":"stop"');
      expect(full).toContain("data: [DONE]");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("returns 502 when upstream body is empty (null body)", async () => {
    const origFetch = globalThis.fetch;
    // new Response(null) yields body === null, which handleStreamingResponse detects
    globalThis.fetch = (() =>
      Promise.resolve(
        new globalThis.Response(null as unknown as BodyInit, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        })
      )) as unknown as typeof globalThis.fetch;

    try {
      const result = await handleChatCore({
        body: { model: "gpt-4o", messages: [{ role: "user", content: "hi" }], stream: true },
        modelInfo: { provider: "openai", model: "gpt-4o" },
        credentials: { apiKey: "test-key" },
      });

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
      expect(result.response!.status).toBe(502);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
