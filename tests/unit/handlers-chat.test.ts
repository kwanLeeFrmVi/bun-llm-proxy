/**
 * Tests for handlers/chat.ts — SSE error responses for streaming clients.
 *
 * The bug: Claude Code crashes with `undefined is not an object (evaluating '_.input_tokens')`
 * when the proxy returns JSON errors instead of SSE-formatted errors for streaming requests.
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";
import { sseErrorResponse } from "../../ai-bridge/utils/error.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse SSE text into { event, data } pairs */
function parseSSE(text: string): Array<{ event: string; data: unknown }> {
  const events: Array<{ event: string; data: unknown }> = [];
  const blocks = text.split("\n\n").filter(Boolean);
  for (const block of blocks) {
    let eventName = "";
    let dataStr = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) eventName = line.slice(7);
      else if (line.startsWith("data: ")) dataStr = line.slice(6);
    }
    if (dataStr === "[DONE]") {
      events.push({ event: eventName, data: "[DONE]" });
    } else if (dataStr) {
      events.push({ event: eventName, data: JSON.parse(dataStr) });
    }
  }
  return events;
}

// ─── Unit: sseErrorResponse ───────────────────────────────────────────────────

describe("sseErrorResponse", () => {
  it("returns Content-Type: text/event-stream", () => {
    const res = sseErrorResponse(503, "upstream overloaded");
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
  });

  it("returns HTTP 200 so Claude Code consumes the SSE stream", () => {
    const res = sseErrorResponse(429, "rate limited");
    expect(res.status).toBe(200);
  });

  it("includes message_start with usage containing input_tokens and output_tokens", async () => {
    const res = sseErrorResponse(503, "error");
    const text = await res.text();
    const events = parseSSE(text);

    const start = events.find((e) => e.event === "message_start");
    expect(start).toBeDefined();
    const msg = (start!.data as Record<string, unknown>).message as Record<string, unknown>;
    expect(msg.type).toBe("message");
    expect(msg.role).toBe("assistant");
    expect(msg.content).toEqual([]);
    const usage = msg.usage as Record<string, number>;
    expect(usage.input_tokens).toBe(0);
    expect(usage.output_tokens).toBe(0);
  });

  it("includes message_delta with usage containing input_tokens and output_tokens", async () => {
    const res = sseErrorResponse(503, "error");
    const text = await res.text();
    const events = parseSSE(text);

    const delta = events.find((e) => e.event === "message_delta");
    expect(delta).toBeDefined();
    const d = delta!.data as Record<string, unknown>;
    const usage = d.usage as Record<string, number>;
    expect(usage.input_tokens).toBe(0);
    expect(usage.output_tokens).toBe(1);
    const deltaObj = d.delta as Record<string, unknown>;
    expect(deltaObj.stop_reason).toBe("end_turn");
  });

  it("includes message_stop event", async () => {
    const res = sseErrorResponse(503, "error");
    const text = await res.text();
    const events = parseSSE(text);

    const stop = events.find((e) => e.event === "message_stop");
    expect(stop).toBeDefined();
    expect((stop!.data as Record<string, unknown>).type).toBe("message_stop");
  });

  it("ends with data: [DONE]", async () => {
    const res = sseErrorResponse(503, "error");
    const text = await res.text();
    expect(text).toContain("data: [DONE]");
  });

  it("includes error message in content_block_delta text", async () => {
    const res = sseErrorResponse(429, "Rate limit exceeded");
    const text = await res.text();
    const events = parseSSE(text);

    const cbDelta = events.find((e) => e.event === "content_block_delta");
    expect(cbDelta).toBeDefined();
    const delta = (cbDelta!.data as Record<string, unknown>).delta as Record<string, unknown>;
    expect(delta.type).toBe("text_delta");
    expect(delta.text).toBe("[Proxy Error 429] Rate limit exceeded");
  });

  it("emits events in correct order: message_start → content_block_start → content_block_delta → content_block_stop → message_delta → message_stop → [DONE]", async () => {
    const res = sseErrorResponse(503, "error");
    const text = await res.text();
    const events = parseSSE(text);

    const eventTypes = events.map((e) => e.event || "[DONE]");
    const startIdx = eventTypes.indexOf("message_start");
    const cbStartIdx = eventTypes.indexOf("content_block_start");
    const cbDeltaIdx = eventTypes.indexOf("content_block_delta");
    const cbStopIdx = eventTypes.indexOf("content_block_stop");
    const deltaIdx = eventTypes.indexOf("message_delta");
    const stopIdx = eventTypes.indexOf("message_stop");
    const doneIdx = eventTypes.indexOf("[DONE]");

    expect(startIdx).toBeLessThan(cbStartIdx);
    expect(cbStartIdx).toBeLessThan(cbDeltaIdx);
    expect(cbDeltaIdx).toBeLessThan(cbStopIdx);
    expect(cbStopIdx).toBeLessThan(deltaIdx);
    expect(deltaIdx).toBeLessThan(stopIdx);
    expect(stopIdx).toBeLessThan(doneIdx);
  });
});

// ─── Integration: handleChat streaming error paths ────────────────────────────
//
// These tests mock all dependencies and verify that handleChat returns
// SSE-formatted errors when stream=true and JSON errors when stream=false.

// Mocks must be declared before importing the module under test.
const mockCheckAuth = mock((_req: unknown) =>
  Promise.resolve({ ok: true, apiKey: "test-key", apiKeyId: "test-id" })
);
const mockGetSettings = mock(() => Promise.resolve({}));
const mockGetModelInfo = mock(() => Promise.resolve({ provider: null, model: null }));
const mockGetComboModelConfigs = mock(() => Promise.resolve(null));
const mockGetProviderCredentials = mock(() => Promise.resolve(null));
const mockCheckAndRefreshToken = mock((_p: string, c: Record<string, unknown>) =>
  Promise.resolve(c)
);

const mockMarkAccountUnavailable = mock(() => Promise.resolve({ shouldFallback: false }));
const mockClearAccountError = mock(() => Promise.resolve());
const mockUpdateProviderCredentials = mock(() => Promise.resolve(true));
const mockGetProjectIdForConnection = mock(() => Promise.resolve(null));
const mockIncrementCircuitBreaker = mock(() => Promise.resolve(0));
const mockResetCircuitBreaker = mock(() => Promise.resolve());
const mockGetProviderDisplayName = mock(() => Promise.resolve("test-provider"));

mock.module("../../lib/authMiddleware.ts", () => ({ checkAuth: mockCheckAuth }));
mock.module("../../db/index.ts", () => ({
  getSettings: mockGetSettings,
  getAverageTTFT: mock(() => Promise.resolve(null)),
  recordComboTTFT: mock(() => Promise.resolve()),
}));
mock.module("../../services/model.ts", () => ({
  getModelInfo: mockGetModelInfo,
  getComboModelConfigs: mockGetComboModelConfigs,
}));
mock.module("../../services/auth.ts", () => ({
  getProviderCredentials: mockGetProviderCredentials,
  markAccountUnavailable: mockMarkAccountUnavailable,
  clearAccountError: mockClearAccountError,
}));
mock.module("../../services/tokenRefresh.ts", () => ({
  checkAndRefreshToken: mockCheckAndRefreshToken,
  updateProviderCredentials: mockUpdateProviderCredentials,
  getProjectIdForConnection: mockGetProjectIdForConnection,
}));
mock.module("../../lib/circuitBreaker.ts", () => ({
  incrementCircuitBreaker: mockIncrementCircuitBreaker,
  resetCircuitBreaker: mockResetCircuitBreaker,
}));
mock.module("../../lib/providers.ts", () => ({
  getProviderDisplayName: mockGetProviderDisplayName,
}));

// Import after mocks are set up
import { handleChat } from "../../handlers/chat.ts";

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer test-key",
    },
    body: JSON.stringify(body),
  });
}

describe("handleChat — streaming error responses", () => {
  beforeEach(() => {
    // Reset all mocks
    mockCheckAuth.mockImplementation((_req: unknown) =>
      Promise.resolve({ ok: true, apiKey: "test-key", apiKeyId: "test-id" })
    );
    mockGetSettings.mockImplementation(() => Promise.resolve({}));
    mockGetModelInfo.mockImplementation(() => Promise.resolve({ provider: null, model: null }));
    mockGetComboModelConfigs.mockImplementation(() => Promise.resolve(null));
    mockGetProviderCredentials.mockImplementation(() => Promise.resolve(null));
    mockCheckAndRefreshToken.mockImplementation((_p: string, c: Record<string, unknown>) =>
      Promise.resolve(c)
    );
  });

  // ── Missing model ────────────────────────────────────────────────────────────

  it("returns SSE error when stream=true and model is missing", async () => {
    const res = await handleChat(
      makeRequest({
        stream: true,
        messages: [{ role: "user", content: "hi" }],
      })
    );
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    // sseErrorResponse always returns 200 so Claude Code consumes the stream
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("message_start");
    expect(text).toContain("message_delta");
    expect(text).toContain("input_tokens");
    // Error message should be visible in content blocks
    expect(text).toContain("Proxy Error");
  });

  it("returns JSON error when stream=false and model is missing", async () => {
    const res = await handleChat(
      makeRequest({
        stream: false,
        messages: [{ role: "user", content: "hi" }],
      })
    );
    expect(res.headers.get("Content-Type")).toBe("application/json");
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  // ── Invalid model format ─────────────────────────────────────────────────────

  it("returns SSE error when stream=true and model has no provider", async () => {
    mockGetModelInfo.mockImplementation(() => Promise.resolve({ provider: null, model: null }));

    const res = await handleChat(
      makeRequest({
        model: "nonexistent-model",
        stream: true,
        messages: [{ role: "user", content: "hi" }],
      })
    );
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    const text = await res.text();
    expect(text).toContain("message_delta");
  });

  it("returns JSON error when stream=false and model has no provider", async () => {
    mockGetModelInfo.mockImplementation(() => Promise.resolve({ provider: null, model: null }));

    const res = await handleChat(
      makeRequest({
        model: "nonexistent-model",
        stream: false,
        messages: [{ role: "user", content: "hi" }],
      })
    );
    expect(res.headers.get("Content-Type")).toBe("application/json");
  });

  // ── No credentials ───────────────────────────────────────────────────────────

  it("returns SSE error when stream=true and no credentials available", async () => {
    mockGetModelInfo.mockImplementation(() =>
      Promise.resolve({ provider: "openai", model: "gpt-4o" })
    );
    mockGetProviderCredentials.mockImplementation(() => Promise.resolve(null));

    const res = await handleChat(
      makeRequest({
        model: "openai/gpt-4o",
        stream: true,
        messages: [{ role: "user", content: "hi" }],
      })
    );
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    const text = await res.text();
    expect(text).toContain("message_delta");
    expect(text).toContain("input_tokens");
  });

  // ── Upstream error (503) ─────────────────────────────────────────────────────

  it("returns SSE error when stream=true and upstream returns 503", async () => {
    mockGetModelInfo.mockImplementation(() =>
      Promise.resolve({ provider: "openai", model: "gpt-4o" })
    );
    mockGetProviderCredentials.mockImplementation(() =>
      Promise.resolve({
        connectionId: "conn-1",
        connectionName: "test-conn",
        apiKey: "test-key",
        refreshToken: "test-refresh",
        accessToken: "test-access",
      })
    );
    mockMarkAccountUnavailable.mockImplementation(() => Promise.resolve({ shouldFallback: false }));

    // Mock fetch so the real handleChatCore gets a 503 response
    const origFetch = globalThis.fetch;
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response("Service Unavailable", { status: 503 })
      )) as unknown as typeof globalThis.fetch;

    try {
      const res = await handleChat(
        makeRequest({
          model: "openai/gpt-4o",
          stream: true,
          messages: [{ role: "user", content: "hi" }],
        })
      );
      expect(res.headers.get("Content-Type")).toBe("text/event-stream");
      const text = await res.text();
      // Verify the full SSE lifecycle that Claude Code expects
      const events = parseSSE(text);
      const start = events.find((e) => e.event === "message_start");
      const delta = events.find((e) => e.event === "message_delta");
      const stop = events.find((e) => e.event === "message_stop");
      expect(start).toBeDefined();
      expect(delta).toBeDefined();
      expect(stop).toBeDefined();
      // The critical field that was missing and caused the crash
      const deltaData = delta!.data as Record<string, unknown>;
      const usage = deltaData.usage as Record<string, number>;
      expect(typeof usage.input_tokens).toBe("number");
      expect(typeof usage.output_tokens).toBe("number");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("returns JSON error when stream=false and upstream returns 503", async () => {
    mockGetModelInfo.mockImplementation(() =>
      Promise.resolve({ provider: "openai", model: "gpt-4o" })
    );
    mockGetProviderCredentials.mockImplementation(() =>
      Promise.resolve({
        connectionId: "conn-1",
        connectionName: "test-conn",
        apiKey: "test-key",
      })
    );
    mockMarkAccountUnavailable.mockImplementation(() => Promise.resolve({ shouldFallback: false }));

    const origFetch = globalThis.fetch;
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response("Service Unavailable", { status: 503 })
      )) as unknown as typeof globalThis.fetch;

    try {
      const res = await handleChat(
        makeRequest({
          model: "openai/gpt-4o",
          stream: false,
          messages: [{ role: "user", content: "hi" }],
        })
      );
      expect(res.headers.get("Content-Type")).toBe("application/json");
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

// ─── wrapStreamingResponse error injection tests ──────────────────────────────

describe("wrapStreamingResponse — mid-stream error injection", () => {
  /**
   * Create a Response whose body stream throws after emitting some chunks.
   * This simulates an upstream disconnect mid-stream.
   *
   * Note: chatCore.ts's inner stream handler catches upstream errors and
   * flushes synthetic message_delta/message_stop events before closing
   * normally. So the OUTER stream (wrapStreamingResponse) typically sees
   * a clean close with those synthetic events already included.
   *
   * This test verifies the complete error sequence reaches the client.
   */
  function createFailingStreamResponse(
    chunksBeforeError: string[],
    _errorMessage: string
  ): Response {
    const encoder = new TextEncoder();
    let chunkIndex = 0;

    // Simulate upstream that sends some chunks then abruptly closes
    // (like a TCP disconnect). This is more realistic than throwing
    // from pull(), which causes unhandled errors in Bun's test runner.
    const body = new ReadableStream({
      pull(controller) {
        if (chunkIndex < chunksBeforeError.length) {
          controller.enqueue(encoder.encode(chunksBeforeError[chunkIndex]!));
          chunkIndex++;
        } else {
          // Abrupt close — no message_delta, no message_stop.
          // This simulates the real-world scenario where the upstream
          // disconnects mid-stream without sending closing events.
          controller.close();
        }
      },
    });

    return new Response(body, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  it("should deliver complete Claude SSE sequence to client when upstream errors mid-stream", async () => {
    mockGetModelInfo.mockImplementation(() =>
      Promise.resolve({ provider: "anthropic", model: "claude-sonnet" })
    );
    mockGetProviderCredentials.mockImplementation(() =>
      Promise.resolve({
        connectionId: "conn-1",
        connectionName: "test-conn",
        apiKey: "test-key",
      })
    );
    mockMarkAccountUnavailable.mockImplementation(() => Promise.resolve({ shouldFallback: false }));
    mockIncrementCircuitBreaker.mockImplementation(() => Promise.resolve(0));

    // Mock fetch to return a stream that sends one valid chunk then throws
    const validChunk =
      `event: message_start\ndata: ${JSON.stringify({
        type: "message_start",
        message: {
          id: "msg_test",
          type: "message",
          role: "assistant",
          content: [],
          usage: { input_tokens: 10, output_tokens: 0 },
        },
      })}\n\n` +
      `event: content_block_start\ndata: ${JSON.stringify({
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      })}\n\n` +
      `event: content_block_delta\ndata: ${JSON.stringify({
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "Hello" },
      })}\n\n`;

    const origFetch = globalThis.fetch;
    globalThis.fetch = (() =>
      Promise.resolve(createFailingStreamResponse([validChunk], "Connection reset by peer"))) as unknown as typeof globalThis.fetch;

    try {
      const res = await handleChat(
        makeRequest({
          model: "anthropic/claude-sonnet",
          stream: true,
          messages: [{ role: "user", content: "hi" }],
        })
      );

      // Debug: log the raw response text to understand what we got
      // (the inner stream may propagate the upstream error to the consumer)
      const text = await res.text().catch((e: Error) => {
        console.log("[TEST] res.text() rejected:", e.message);
        return "";
      });

      // Verify the complete Claude SSE event sequence was delivered to the client.
      // The inner stream handler (chatCore.ts) detects the upstream closed without
      // sending message_delta and emits synthetic message_delta + message_stop events.
      const events = parseSSE(text);

      // Should contain the original valid events
      const start = events.find((e) => e.event === "message_start");
      expect(start).toBeDefined();

      // Should contain the original content
      const contentDeltas = events.filter((e) => e.event === "content_block_delta");
      expect(contentDeltas.length).toBeGreaterThanOrEqual(1);

      // CRITICAL: Should contain message_delta with usage (synthetic fallback)
      const msgDelta = events.find((e) => e.event === "message_delta");
      expect(msgDelta).toBeDefined();
      const deltaData = msgDelta!.data as Record<string, unknown>;
      const usage = deltaData.usage as Record<string, number>;
      expect(typeof usage.input_tokens).toBe("number");
      expect(typeof usage.output_tokens).toBe("number");

      // Should contain message_stop
      const msgStop = events.find((e) => e.event === "message_stop");
      expect(msgStop).toBeDefined();
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

// ─── classifyNetworkError tests (tested via error response path) ──────────────

describe("classifyNetworkError — error categorization via response", () => {
  it("should return SSE error with TLS error message when upstream has certificate error", async () => {
    mockGetModelInfo.mockImplementation(() =>
      Promise.resolve({ provider: "anthropic-compatible-test", model: "claude-sonnet" })
    );
    mockGetProviderCredentials.mockImplementation(() =>
      Promise.resolve({
        connectionId: "conn-1",
        connectionName: "test-conn",
        apiKey: "test-key",
      })
    );
    mockMarkAccountUnavailable.mockImplementation(() => Promise.resolve({ shouldFallback: false }));
    mockIncrementCircuitBreaker.mockImplementation(() => Promise.resolve(0));

    // Mock fetch to throw a TLS certificate error
    const origFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("unable to verify the first certificate");
    }) as unknown as typeof globalThis.fetch;

    try {
      const res = await handleChat(
        makeRequest({
          model: "anthropic-compatible-test/claude-sonnet",
          stream: true,
          messages: [{ role: "user", content: "hi" }],
        })
      );

      // Should return an SSE error response (not crash)
      expect(res.headers.get("Content-Type")).toBe("text/event-stream");
      const text = await res.text();

      // Should contain the full Claude SSE event sequence
      const events = parseSSE(text);
      const start = events.find((e) => e.event === "message_start");
      const delta = events.find((e) => e.event === "message_delta");
      const stop = events.find((e) => e.event === "message_stop");
      expect(start).toBeDefined();
      expect(delta).toBeDefined();
      expect(stop).toBeDefined();

      // The error message should mention the certificate error
      const cbDelta = events.find((e) => e.event === "content_block_delta");
      expect(cbDelta).toBeDefined();
      const deltaText = ((cbDelta!.data as Record<string, unknown>).delta as Record<string, unknown>).text as string;
      expect(deltaText).toContain("unable to verify the first certificate");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("should return SSE error with connection refused message", async () => {
    mockGetModelInfo.mockImplementation(() =>
      Promise.resolve({ provider: "ollama-local", model: "llama3" })
    );
    mockGetProviderCredentials.mockImplementation(() =>
      Promise.resolve({
        connectionId: "conn-1",
        connectionName: "test-conn",
        apiKey: "test-key",
        providerSpecificData: { baseUrl: "http://localhost:11434" },
      })
    );
    mockMarkAccountUnavailable.mockImplementation(() => Promise.resolve({ shouldFallback: false }));
    mockIncrementCircuitBreaker.mockImplementation(() => Promise.resolve(0));

    const origFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof globalThis.fetch;

    try {
      const res = await handleChat(
        makeRequest({
          model: "ollama-local/llama3",
          stream: true,
          messages: [{ role: "user", content: "hi" }],
        })
      );

      expect(res.headers.get("Content-Type")).toBe("text/event-stream");
      const text = await res.text();
      const events = parseSSE(text);
      const cbDelta = events.find((e) => e.event === "content_block_delta");
      expect(cbDelta).toBeDefined();
      const deltaText = ((cbDelta!.data as Record<string, unknown>).delta as Record<string, unknown>).text as string;
      expect(deltaText).toContain("ECONNREFUSED");
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
