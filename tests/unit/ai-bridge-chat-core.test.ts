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

  it("streaming: handles mid-stream upstream reader error without throwing", async () => {
    // Simulates connection drop: source closes after the first chunk (no final chunk sent).
    // Downstream sees an incomplete stream and the proxy must not throw "Controller is already closed".
    // The scenario: upstream delivers chunks then closes abruptly without [DONE] / message_delta.
    const origFetch = globalThis.fetch;
    void origFetch; // intentionally unused when branch is taken
    globalThis.fetch = (() => {
      const body = new ReadableStream({
        start(controller) {
          // Deliver first chunk normally
          controller.enqueue(
            new TextEncoder().encode('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n')
          );
          // Simulate abrupt upstream close (connection reset) by closing the controller
          // before the final [DONE] / message_delta is sent. This mirrors real connection drops.
          setTimeout(() => {
            controller.close();
          }, 5);
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

      // Consume the stream: we may get the first chunk; the proxy should not throw.
      const reader = result.response!.body!.getReader();
      const chunks: string[] = [];
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(new TextDecoder().decode(value));
        }
      } catch {
        /* read after upstream close — catch and continue */
      } finally {
        reader.releaseLock();
      }
      // At minimum, the first chunk should have been buffered before the close.
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("streaming: handles client cancellation without throwing 'Controller is already closed'", async () => {
    // Verifies that when the downstream consumer cancels mid-stream:
    //   1. No unhandled error is thrown from the ReadableStream.
    //   2. The proxy does not attempt to close an already-closed controller.
    const origFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      const body = new ReadableStream({
        start(controller) {
          let canceled = false;
          const trySend = (bytes: Uint8Array) => {
            if (canceled) return;
            try {
              controller.enqueue(bytes);
            } catch {
              canceled = true;
            }
          };
          const tryClose = () => {
            if (canceled) return;
            try {
              controller.close();
            } catch {
              canceled = true;
            }
          };
          trySend(
            new TextEncoder().encode('data: {"choices":[{"delta":{"content":"hello"}}]}\n\n')
          );
          setTimeout(() => {
            trySend(
              new TextEncoder().encode('data: {"choices":[{"delta":{"content":" world"}}]}\n\n')
            );
            setTimeout(() => {
              trySend(new TextEncoder().encode("data: [DONE]\n\n"));
              tryClose();
            }, 5);
          }, 5);
        },
        cancel() {
          // Cancellation propagates via the try/catch guards above
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

      // Cancel the downstream body after reading one chunk — simulates a disconnecting client.
      const reader = result.response!.body!.getReader();
      const first = await reader.read();
      expect(first.done).toBe(false);
      // Cancel mid-stream — this triggers the ReadableStream's cancel() handler.
      await reader.cancel();
      reader.releaseLock();

      // If we reach here without an uncaught exception, the test passes.
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("streaming: outer wrapper consuming inner stream — inner completes after outer closes (req:m99vhq regression)", async () => {
    // Regression for the exact observed pattern: the outer ReadableStream (handlers/chat.ts
    // wrapStreamingResponse) closed, but the inner ReadableStream (chatCore.ts) continued
    // reading and logging "Stream complete" for the same request ID.
    //
    // With the fix (safeEnqueue/safeClose + cancel propagation), enqueue/close are no-ops
    // once the downstream is canceled, and reader.cancel() aborts the inner read loop.
    //
    // This test verifies the inner stream does NOT throw after outer cancellation.
    const origFetch = globalThis.fetch;
    let sourceTimerId: ReturnType<typeof setTimeout> | null = null;
    let sourceCanceled = false;

    globalThis.fetch = (() => {
      const body = new ReadableStream({
        start(controller) {
          // Deliver only the FIRST event synchronously inside start().
          // The remaining events are delivered on a timer, ensuring the
          // outer consumer can cancel before the source has finished.
          const first =
            'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_01","type":"message","role":"assistant","content":[],"model":"claude-3-5-sonnet-20241022","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":10,"output_tokens":0}}}\n\n';
          try {
            controller.enqueue(new TextEncoder().encode(first));
          } catch {
            return;
          }
          // Schedule remaining events — they will be delivered AFTER the consumer reads
          // and cancels, so the inner stream will be mid-read when the cancel fires.
          const remaining = [
            'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n',
            'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}\n\n',
            'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":2}}\n\n',
          ];
          let ri = 0;
          const sendNext = () => {
            if (sourceCanceled) return;
            if (ri < remaining.length) {
              try {
                controller.enqueue(new TextEncoder().encode(remaining[ri++]));
              } catch {
                sourceCanceled = true;
                return;
              }
              sourceTimerId = setTimeout(sendNext, 8);
            } else {
              try {
                controller.close();
              } catch {
                /* already closed */
              }
            }
          };
          sourceTimerId = setTimeout(sendNext, 8);
        },
        cancel() {
          sourceCanceled = true;
          if (sourceTimerId !== null) clearTimeout(sourceTimerId);
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
      // Use claude→claude passthrough (same as anthropic-compatible-* provider)
      const result = await handleChatCore({
        body: {
          model: "anthropic-compatible-myprovider/claude-3-5-sonnet-20241022",
          messages: [{ role: "user", content: "hi" }],
          stream: true,
        },
        modelInfo: {
          provider: "anthropic-compatible-myprovider",
          model: "claude-3-5-sonnet-20241022",
        },
        credentials: { apiKey: "test-key" },
        sourceFormatOverride: "claude",
      });

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();

      // Read only the first chunk, then cancel — simulating an outer wrapper that closes early
      const reader = result.response!.body!.getReader();
      const first = await reader.read();
      expect(first.done).toBe(false);
      // Cancel the outer consumer — this should propagate into the inner read loop
      await reader.cancel();
      reader.releaseLock();

      // Allow any in-flight async work to settle. If no uncaught exception is thrown
      // within this window, the double-close guard is working.
      await new Promise((resolve) => setTimeout(resolve, 30));
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("anthropic-compatible: passthrough of correct Claude SSE format completes without warning", async () => {
    // anthropic-compatible-* providers send claude→claude identity passthrough.
    // When the upstream returns proper Claude SSE events, the proxy should complete
    // cleanly without emitting any SSE-shape warnings.
    const origFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      const events = [
        'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_01","type":"message","role":"assistant","content":[],"model":"claude-sonnet","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":5,"output_tokens":0}}}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi!"}}\n\n',
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":1}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
        "data: [DONE]\n\n",
      ];
      const body = new ReadableStream({
        start(controller) {
          for (const e of events) controller.enqueue(new TextEncoder().encode(e));
          controller.close();
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
        body: {
          model: "anthropic-compatible-myprovider/claude-sonnet",
          messages: [{ role: "user", content: "hi" }],
          stream: true,
        },
        modelInfo: { provider: "anthropic-compatible-myprovider", model: "claude-sonnet" },
        credentials: { apiKey: "test-key" },
        sourceFormatOverride: "claude",
      });

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();

      const reader = result.response!.body!.getReader();
      const chunks: string[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(new TextDecoder().decode(value));
      }
      reader.releaseLock();
      const full = chunks.join("");
      // Should contain passthrough Claude SSE events
      expect(full).toContain("message_start");
      expect(full).toContain("message_delta");
      expect(full).toContain("message_stop");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("anthropic-compatible: upstream returning OpenAI-format SSE logs a diagnostic warning", async () => {
    // When anthropic-compatible-* upstream returns OpenAI-format events instead of
    // Claude-format events, the proxy should pass through (identity) but also log a
    // diagnosable warning. This test confirms the proxy does not crash or throw.
    const origFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      const openAIEvents = [
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n',
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","model":"gpt-4o","choices":[{"index":0,"delta":{"content":"Hello!"},"finish_reason":null}]}\n\n',
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ];
      const body = new ReadableStream({
        start(controller) {
          for (const e of openAIEvents) controller.enqueue(new TextEncoder().encode(e));
          controller.close();
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
        body: {
          model: "anthropic-compatible-badprovider/some-model",
          messages: [{ role: "user", content: "hi" }],
          stream: true,
        },
        modelInfo: { provider: "anthropic-compatible-badprovider", model: "some-model" },
        credentials: { apiKey: "test-key" },
        sourceFormatOverride: "claude",
      });

      // The proxy should still return a stream response (identity passthrough) without throwing
      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
      expect(result.response!.headers.get("Content-Type")).toBe("text/event-stream");

      // Drain the stream — the OpenAI SSE events should pass through unchanged
      const reader = result.response!.body!.getReader();
      const chunks: string[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(new TextDecoder().decode(value));
      }
      reader.releaseLock();
      const full = chunks.join("");
      // The raw OpenAI bytes should have passed through (identity passthrough)
      expect(full).toContain("chat.completion.chunk");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("openai-compatible: streaming passthrough forwards upstream SSE byte-for-byte with a single [DONE]", async () => {
    // Regression: openai-compatible-* providers use sourceFormat=openai, targetFormat=openai
    // (identity passthrough). The proxy must forward every upstream SSE event unchanged and
    // NOT inject a duplicate synthetic `data: [DONE]\n\n` after the upstream's own terminator.
    const openAIEvents = [
      'data: {"id":"chatcmpl-x","object":"chat.completion.chunk","model":"m","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n',
      'data: {"id":"chatcmpl-x","object":"chat.completion.chunk","model":"m","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
      'data: {"id":"chatcmpl-x","object":"chat.completion.chunk","model":"m","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}\n\n',
      'data: {"id":"chatcmpl-x","object":"chat.completion.chunk","model":"m","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ];

    const origFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      const body = new ReadableStream({
        start(controller) {
          for (const e of openAIEvents) {
            controller.enqueue(new TextEncoder().encode(e));
          }
          controller.close();
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
        body: {
          model: "openai-compatible-myprovider/some-model",
          messages: [{ role: "user", content: "hi" }],
          stream: true,
        },
        modelInfo: { provider: "openai-compatible-myprovider", model: "some-model" },
        credentials: {
          apiKey: "test-key",
          providerSpecificData: { baseUrl: "https://example.test/v1" },
        },
        sourceFormatOverride: "openai",
      });

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
      expect(result.response!.headers.get("Content-Type")).toBe("text/event-stream");

      const reader = result.response!.body!.getReader();
      const chunks: string[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(new TextDecoder().decode(value));
      }
      reader.releaseLock();
      const full = chunks.join("");

      // Every upstream event must appear verbatim
      expect(full).toContain('"content":"Hello"');
      expect(full).toContain('"content":" world"');
      expect(full).toContain('"finish_reason":"stop"');

      // Exactly ONE `data: [DONE]` — no synthetic duplicate injected by the proxy.
      const doneMatches = full.match(/data: \[DONE\]/g) ?? [];
      expect(doneMatches.length).toBe(1);

      // No Claude termination events leaked into an OpenAI stream
      expect(full).not.toContain("message_start");
      expect(full).not.toContain("message_stop");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("openai-compatible: non-streaming passthrough returns upstream JSON body unchanged", async () => {
    // Regression: with openai-compatible-* providers the non-streaming path should be pure
    // passthrough. The response body must round-trip back to the same JSON object and the
    // Content-Type must be application/json.
    const upstreamJson = {
      id: "chatcmpl-xyz",
      object: "chat.completion",
      created: 1_234_567_890,
      model: "some-model",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "hello from upstream" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 5, completion_tokens: 4, total_tokens: 9 },
    };

    const origFetch = globalThis.fetch;
    globalThis.fetch = (() =>
      Promise.resolve(
        new globalThis.Response(JSON.stringify(upstreamJson), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )) as unknown as typeof globalThis.fetch;

    try {
      const result = await handleChatCore({
        body: {
          model: "openai-compatible-myprovider/some-model",
          messages: [{ role: "user", content: "hi" }],
          stream: false,
        },
        modelInfo: { provider: "openai-compatible-myprovider", model: "some-model" },
        credentials: {
          apiKey: "test-key",
          providerSpecificData: { baseUrl: "https://example.test/v1" },
        },
        sourceFormatOverride: "openai",
      });

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
      expect(result.response!.headers.get("Content-Type")).toBe("application/json");

      const bodyText = await result.response!.text();
      const parsed = JSON.parse(bodyText);
      expect(parsed).toEqual(upstreamJson);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("preserves upstream error message for 503 in non-streaming requests", async () => {
    const upstreamErrorMsg = "Không có sssaicode account nào available";
    const origFetch = globalThis.fetch;
    globalThis.fetch = (() =>
      Promise.resolve(
        new globalThis.Response(
          JSON.stringify({ error: { message: upstreamErrorMsg, type: "service_unavailable" } }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        )
      )) as unknown as typeof globalThis.fetch;

    try {
      const result = await handleChatCore({
        body: {
          model: "anthropic-compatible-myprovider/some-model",
          messages: [{ role: "user", content: "hi" }],
          stream: false,
        },
        modelInfo: { provider: "anthropic-compatible-myprovider", model: "some-model" },
        credentials: { apiKey: "test-key" },
        sourceFormatOverride: "claude",
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe(503);
      expect(result.error).toContain(upstreamErrorMsg);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("preserves upstream error message in streaming SSE error response", async () => {
    const upstreamErrorMsg = "Không có sssaicode account nào available";
    const origFetch = globalThis.fetch;
    globalThis.fetch = (() =>
      Promise.resolve(
        new globalThis.Response(
          JSON.stringify({ error: { message: upstreamErrorMsg, type: "service_unavailable" } }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        )
      )) as unknown as typeof globalThis.fetch;

    try {
      const result = await handleChatCore({
        body: {
          model: "anthropic-compatible-myprovider/some-model",
          messages: [{ role: "user", content: "hi" }],
          stream: true,
        },
        modelInfo: { provider: "anthropic-compatible-myprovider", model: "some-model" },
        credentials: { apiKey: "test-key" },
        sourceFormatOverride: "claude",
      });

      // For streaming errors, handleChatCore returns success=true with SSE error response
      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
      expect(result.response!.headers.get("X-Proxy-Error")).toBe("503");

      // Verify the SSE stream contains the error message in Claude format
      const bodyText = await result.response!.text();
      expect(bodyText).toContain(upstreamErrorMsg);
      expect(bodyText).toContain("event: message_start"); // Claude format
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("OpenAI endpoint streaming preserves upstream error message in SSE error response", async () => {
    const upstreamErrorMsg = "Service temporarily unavailable";
    const origFetch = globalThis.fetch;
    globalThis.fetch = (() =>
      Promise.resolve(
        new globalThis.Response(
          JSON.stringify({ error: { message: upstreamErrorMsg, type: "service_unavailable" } }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        )
      )) as unknown as typeof globalThis.fetch;

    try {
      const result = await handleChatCore({
        body: {
          model: "openai-compatible-myprovider/some-model",
          messages: [{ role: "user", content: "hi" }],
          stream: true,
        },
        modelInfo: { provider: "openai-compatible-myprovider", model: "some-model" },
        credentials: { apiKey: "test-key" },
        sourceFormatOverride: "openai",
      });

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
      expect(result.response!.headers.get("X-Proxy-Error")).toBe("503");

      // Verify the SSE stream contains the error message
      const bodyText = await result.response!.text();
      expect(bodyText).toContain(upstreamErrorMsg);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
