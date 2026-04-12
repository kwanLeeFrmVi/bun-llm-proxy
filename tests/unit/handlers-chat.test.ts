/**
 * Tests for handlers/chat.ts — SSE error responses for streaming clients.
 *
 * The bug: Claude Code crashes with `undefined is not an object (evaluating '_.input_tokens')`
 * when the proxy returns JSON errors instead of SSE-formatted errors for streaming requests.
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";
import { sseErrorResponse } from "../../ai-bridge/utils/error.ts";
import { HTTP_STATUS } from "../../ai-bridge/config/runtimeConfig.ts";

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

  it("returns the given HTTP status code", () => {
    const res = sseErrorResponse(429, "rate limited");
    expect(res.status).toBe(429);
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
    expect(usage.output_tokens).toBe(0);
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

  it("emits events in correct order: message_start → message_delta → message_stop → [DONE]", async () => {
    const res = sseErrorResponse(503, "error");
    const text = await res.text();
    const events = parseSSE(text);

    const eventTypes = events.map((e) => e.event || "[DONE]");
    const startIdx = eventTypes.indexOf("message_start");
    const deltaIdx = eventTypes.indexOf("message_delta");
    const stopIdx = eventTypes.indexOf("message_stop");
    const doneIdx = eventTypes.indexOf("[DONE]");

    expect(startIdx).toBeLessThan(deltaIdx);
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
const mockCheckAndRefreshToken = mock((_p: string, c: Record<string, unknown>) => Promise.resolve(c));
const mockTrackPendingRequest = mock(() => {});
const mockAppendRequestLog = mock(() => {});
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
mock.module("../../stubs/usageDb.ts", () => ({
  trackPendingRequest: mockTrackPendingRequest,
  saveRequestUsage: mock(() => Promise.resolve()),
  appendRequestLog: mockAppendRequestLog,
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
    const res = await handleChat(makeRequest({
      stream: true,
      messages: [{ role: "user", content: "hi" }],
    }));
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.status).toBe(HTTP_STATUS.BAD_REQUEST);
    const text = await res.text();
    expect(text).toContain("message_start");
    expect(text).toContain("message_delta");
    expect(text).toContain("input_tokens");
  });

  it("returns JSON error when stream=false and model is missing", async () => {
    const res = await handleChat(makeRequest({
      stream: false,
      messages: [{ role: "user", content: "hi" }],
    }));
    expect(res.headers.get("Content-Type")).toBe("application/json");
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  // ── Invalid model format ─────────────────────────────────────────────────────

  it("returns SSE error when stream=true and model has no provider", async () => {
    mockGetModelInfo.mockImplementation(() => Promise.resolve({ provider: null, model: null }));

    const res = await handleChat(makeRequest({
      model: "nonexistent-model",
      stream: true,
      messages: [{ role: "user", content: "hi" }],
    }));
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    const text = await res.text();
    expect(text).toContain("message_delta");
  });

  it("returns JSON error when stream=false and model has no provider", async () => {
    mockGetModelInfo.mockImplementation(() => Promise.resolve({ provider: null, model: null }));

    const res = await handleChat(makeRequest({
      model: "nonexistent-model",
      stream: false,
      messages: [{ role: "user", content: "hi" }],
    }));
    expect(res.headers.get("Content-Type")).toBe("application/json");
  });

  // ── No credentials ───────────────────────────────────────────────────────────

  it("returns SSE error when stream=true and no credentials available", async () => {
    mockGetModelInfo.mockImplementation(() => Promise.resolve({ provider: "openai", model: "gpt-4o" }));
    mockGetProviderCredentials.mockImplementation(() => Promise.resolve(null));

    const res = await handleChat(makeRequest({
      model: "openai/gpt-4o",
      stream: true,
      messages: [{ role: "user", content: "hi" }],
    }));
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    const text = await res.text();
    expect(text).toContain("message_delta");
    expect(text).toContain("input_tokens");
  });

  // ── Upstream error (503) ─────────────────────────────────────────────────────

  it("returns SSE error when stream=true and upstream returns 503", async () => {
    mockGetModelInfo.mockImplementation(() => Promise.resolve({ provider: "openai", model: "gpt-4o" }));
    mockGetProviderCredentials.mockImplementation(() =>
      Promise.resolve({
        connectionId: "conn-1",
        connectionName: "test-conn",
        apiKey: "test-key",
        refreshToken: "test-refresh",
        accessToken: "test-access",
      })
    );
    mockMarkAccountUnavailable.mockImplementation(() =>
      Promise.resolve({ shouldFallback: false })
    );

    // Mock fetch so the real handleChatCore gets a 503 response
    const origFetch = globalThis.fetch;
    globalThis.fetch = (() =>
      Promise.resolve(new Response("Service Unavailable", { status: 503 }))
    ) as unknown as typeof globalThis.fetch;

    try {
      const res = await handleChat(makeRequest({
        model: "openai/gpt-4o",
        stream: true,
        messages: [{ role: "user", content: "hi" }],
      }));
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
    mockGetModelInfo.mockImplementation(() => Promise.resolve({ provider: "openai", model: "gpt-4o" }));
    mockGetProviderCredentials.mockImplementation(() =>
      Promise.resolve({
        connectionId: "conn-1",
        connectionName: "test-conn",
        apiKey: "test-key",
      })
    );
    mockMarkAccountUnavailable.mockImplementation(() =>
      Promise.resolve({ shouldFallback: false })
    );

    const origFetch = globalThis.fetch;
    globalThis.fetch = (() =>
      Promise.resolve(new Response("Service Unavailable", { status: 503 }))
    ) as unknown as typeof globalThis.fetch;

    try {
      const res = await handleChat(makeRequest({
        model: "openai/gpt-4o",
        stream: false,
        messages: [{ role: "user", content: "hi" }],
      }));
      expect(res.headers.get("Content-Type")).toBe("application/json");
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
