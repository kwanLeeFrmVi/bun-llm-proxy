/**
 * Unit tests for ai-bridge response translators (Response() and ResponseNonStream()).
 * Tests the streaming state machines and non-streaming transformations.
 */

import { describe, it, expect } from "bun:test";
import { Response, ResponseNonStream } from "../../ai-bridge/translator/index.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function encode(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function decodeAll(chunks: Uint8Array[]): string[] {
  return chunks.map(c => new TextDecoder().decode(c));
}

function parseSSELines(raw: string): { event?: string; data?: string }[] {
  const results: { event?: string; data?: string }[] = [];
  let current: { event?: string; data?: string } = {};
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) {
      if (current.data !== undefined) results.push(current);
      current = { event: line.slice(5).trim() };
    } else if (line.startsWith("data:")) {
      current.data = line.slice(4).trim();
    } else if (line === "") {
      if (current.data !== undefined) results.push(current);
      current = {};
    }
  }
  if (current.data !== undefined) results.push(current);
  return results;
}

// ─── openai → claude (streaming) ───────────────────────────────────────────

describe("openai → claude (Response — streaming)", () => {
  it("emits message_start, content_block_start, content_block_delta on first chunk", () => {
    const chunk = encode('data: {"id":"chat_123","object":"chat.completion.chunk","model":"claude-sonnet-4","created":1234567890,"choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n');
    const chunks = decodeAll(Response("openai", "claude", null as unknown as string, "claude-sonnet-4", encode("{}"), encode("{}"), chunk, undefined));

    expect(chunks.length).toBeGreaterThan(0);
    const raw = chunks.join("");
    expect(raw).toContain("event: message_start");
    expect(raw).toContain('"type":"message_start"');
    expect(raw).toContain('"id":"chat_123"');
  });

  it("accumulates text content into content_block_delta", () => {
    const chunk = encode('data: {"id":"chat_123","choices":[{"index":0,"delta":{"content":"hello"},"finish_reason":null}]}\n\n');
    const chunks = decodeAll(Response("openai", "claude", null as unknown as string, "claude-sonnet-4", encode("{}"), encode("{}"), chunk, undefined));
    const raw = chunks.join("");

    expect(raw).toContain("event: content_block_delta");
    expect(raw).toContain('"text":"hello"');
  });

  it("handles [DONE] marker gracefully", () => {
    const chunk = encode("data: [DONE]\n\n");
    const chunks = decodeAll(Response("openai", "claude", null as unknown as string, "claude-sonnet-4", encode("{}"), encode("{}"), chunk, undefined));
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("maps finish_reason stop → end_turn", () => {
    const chunk = encode('data: {"id":"chat_123","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n');
    const chunks = decodeAll(Response("openai", "claude", null as unknown as string, "claude-sonnet-4", encode("{}"), encode("{}"), chunk, undefined));
    const raw = chunks.join("");

    expect(raw).toContain("event: message_delta");
    expect(raw).toContain('"stop_reason":"end_turn"');
    expect(raw).toContain("event: message_stop");
  });

  it("maps finish_reason tool_calls → tool_use", () => {
    const chunk = encode('data: {"id":"chat_123","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n');
    const chunks = decodeAll(Response("openai", "claude", null as unknown as string, "claude-sonnet-4", encode("{}"), encode("{}"), chunk, undefined));
    const raw = chunks.join("");

    expect(raw).toContain('"stop_reason":"tool_use"');
  });
});

// ─── claude → openai (streaming) ────────────────────────────────────────────

describe("claude → openai (Response — streaming)", () => {
  it("parses message_start and emits OpenAI chunk with role", () => {
    const sse = 'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_abc","type":"message","role":"assistant","model":"claude-sonnet-4","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":0,"output_tokens":0}}}\n\n';
    const chunks = decodeAll(Response("claude", "openai", null as unknown as string, "claude-sonnet-4", encode("{}"), encode("{}"), encode(sse), undefined));
    const raw = chunks.join("");

    expect(raw).toContain("data: ");
    expect(raw).toContain('"id":"msg_abc"');
    expect(raw).toContain('"object":"chat.completion.chunk"');
    expect(raw).toContain('"role":"assistant"');
  });

  it("parses content_block_delta text and emits delta with content", () => {
    const sse = 'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"world"}}\n\n';
    const chunks = decodeAll(Response("claude", "openai", null as unknown as string, "claude-sonnet-4", encode("{}"), encode("{}"), encode(sse), undefined));
    const raw = chunks.join("");

    expect(raw).toContain('"content":"world"');
  });

  it("handles message_stop and emits [DONE]", () => {
    const sse = 'event: message_stop\ndata: {"type":"message_stop"}\n\n';
    const chunks = decodeAll(Response("claude", "openai", null as unknown as string, "claude-sonnet-4", encode("{}"), encode("{}"), encode(sse), undefined));
    const raw = chunks.join("");

    expect(raw).toContain("data: [DONE]");
  });

  it("maps end_turn → stop finish_reason", () => {
    const sse = 'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"input_tokens":5,"output_tokens":3}}\n\n';
    const chunks = decodeAll(Response("claude", "openai", null as unknown as string, "claude-sonnet-4", encode("{}"), encode("{}"), encode(sse), undefined));
    const raw = chunks.join("");

    expect(raw).toContain('"finish_reason":"stop"');
    expect(raw).toContain('"input_tokens":5');
  });

  it("skips thinking_delta (OpenAI has no thinking support)", () => {
    const sse = 'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"let me think..."}}\n\n';
    const chunks = decodeAll(Response("claude", "openai", null as unknown as string, "claude-sonnet-4", encode("{}"), encode("{}"), encode(sse), undefined));
    const raw = chunks.join("");

    // No OpenAI chunk should be emitted for thinking content
    expect(raw).not.toContain('"content":"let me think');
  });

  it("accumulates tool_use input_json_delta into OpenAI tool_calls", () => {
    const startSse = 'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tool_1","name":"get_weather","input":{}}}\n\n';
    const deltaSse = 'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"city\\":\\"NYC\\"}"}}\n\n';

    const chunks1 = decodeAll(Response("claude", "openai", null as unknown as string, "claude-sonnet-4", encode("{}"), encode("{}"), encode(startSse), undefined));
    const chunks2 = decodeAll(Response("claude", "openai", null as unknown as string, "claude-sonnet-4", encode("{}"), encode("{}"), encode(deltaSse), chunks1));

    const raw = chunks2.join("");
    expect(raw).toContain('"tool_calls"');
    expect(raw).toContain('"get_weather"');
  });
});

// ─── gemini → openai (streaming) ────────────────────────────────────────────

describe("gemini → openai (Response — streaming)", () => {
  it("emits OpenAI chunk on first chunk", () => {
    const raw = encode('{"candidates":[{"content":{"parts":[{"text":"hello"}]}}],"modelVersion":"gemini-2.0-flash"}\n');
    const chunks = decodeAll(Response("gemini", "openai", null as unknown as string, "gemini-2.0-flash", encode("{}"), encode("{}"), raw, undefined));
    const out = chunks.join("");

    expect(out).toContain("data: ");
    expect(out).toContain('"object":"chat.completion.chunk"');
  });

  it("extracts text from candidates[0].content.parts", () => {
    const raw = encode('{"candidates":[{"content":{"parts":[{"text":"gemini says hi"}]}}]}\n');
    const chunks = decodeAll(Response("gemini", "openai", null as unknown as string, "gemini-2.0-flash", encode("{}"), encode("{}"), raw, undefined));
    const out = chunks.join("");

    expect(out).toContain('"content":"gemini says hi"');
  });

  it("handles [DONE] marker", () => {
    const raw = encode("data: [DONE]");
    const chunks = decodeAll(Response("gemini", "openai", null as unknown as string, "gemini-2.0-flash", encode("{}"), encode("{}"), raw, undefined));
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("maps finishReason STOP → finish_reason stop", () => {
    const raw = encode('{"candidates":[{"content":{"parts":[{"text":"done"}]}}],"finishReason":"STOP"}\n');
    const chunks = decodeAll(Response("gemini", "openai", null as unknown as string, "gemini-2.0-flash", encode("{}"), encode("{}"), raw, undefined));
    const out = chunks.join("");

    expect(out).toContain('"finish_reason":"stop"');
    expect(out).toContain("data: [DONE]");
  });
});

// ─── Non-streaming transformations ──────────────────────────────────────────

describe("ResponseNonStream — claude → openai", () => {
  it("transforms Claude non-streaming message to OpenAI chat.completion format", () => {
    const raw = encode(JSON.stringify({
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-4",
      content: [{ type: "text", text: "hello world" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 5 },
    }));
    const result = ResponseNonStream("claude", "openai", null as unknown as string, "claude-sonnet-4", encode("{}"), encode("{}"), raw);
    const out = JSON.parse(new TextDecoder().decode(result));

    expect(out.object).toBe("chat.completion");
    expect(out.id).toBe("msg_test");
    expect(out.choices[0].message.content).toBe("hello world");
    expect(out.choices[0].finish_reason).toBe("stop");
    expect(out.usage.total_tokens).toBe(15);
  });

  it("maps tool_use blocks to tool_calls in non-streaming response", () => {
    const raw = encode(JSON.stringify({
      id: "msg_tool",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-4",
      content: [
        { type: "text", text: "here you go" },
        { type: "tool_use", id: "tool_1", name: "get_weather", input: '{"city":"NYC"}' },
      ],
      stop_reason: "tool_use",
      usage: { input_tokens: 10, output_tokens: 5 },
    }));
    const result = ResponseNonStream("claude", "openai", null as unknown as string, "claude-sonnet-4", encode("{}"), encode("{}"), raw);
    const out = JSON.parse(new TextDecoder().decode(result));

    expect(out.choices[0].message.tool_calls).toBeDefined();
    expect(out.choices[0].message.tool_calls[0].function.name).toBe("get_weather");
    expect(out.choices[0].finish_reason).toBe("tool_calls");
  });
});

describe("ResponseNonStream — openai → claude", () => {
  it("transforms OpenAI chat.completion to Claude message format", () => {
    const raw = encode(JSON.stringify({
      id: "chat_test",
      object: "chat.completion",
      model: "gpt-4o",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "hi there" },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 8, completion_tokens: 3, total_tokens: 11 },
    }));
    const result = ResponseNonStream("openai", "claude", null as unknown as string, "gpt-4o", encode("{}"), encode("{}"), raw);
    const out = JSON.parse(new TextDecoder().decode(result));

    expect(out.type).toBe("message");
    expect(out.role).toBe("assistant");
    expect(out.content[0].text).toBe("hi there");
    expect(out.stop_reason).toBe("end_turn");
    expect(out.usage.input_tokens).toBe(8);
  });

  it("maps tool_calls to tool_use blocks in non-streaming response", () => {
    const raw = encode(JSON.stringify({
      id: "chat_tool",
      object: "chat.completion",
      model: "gpt-4o",
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{
            id: "call_abc",
            type: "function",
            function: { name: "search", arguments: '{"q":"test"}' },
          }],
        },
        finish_reason: "tool_calls",
      }],
    }));
    const result = ResponseNonStream("openai", "claude", null as unknown as string, "gpt-4o", encode("{}"), encode("{}"), raw);
    const out = JSON.parse(new TextDecoder().decode(result));

    expect(out.content[0].type).toBe("tool_use");
    expect(out.content[0].name).toBe("search");
    expect(out.stop_reason).toBe("tool_use");
  });
});

describe("ResponseNonStream — gemini → openai", () => {
  it("transforms Gemini candidates to OpenAI chat.completion format", () => {
    const raw = encode(JSON.stringify({
      candidates: [{
        content: {
          parts: [{ text: "gemini response" }],
        },
      }],
      modelVersion: "gemini-2.0-flash",
      usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3, totalTokenCount: 8 },
    }));
    const result = ResponseNonStream("gemini", "openai", null as unknown as string, "gemini-2.0-flash", encode("{}"), encode("{}"), raw);
    const out = JSON.parse(new TextDecoder().decode(result));

    expect(out.object).toBe("chat.completion");
    expect(out.choices[0].message.content).toBe("gemini response");
    expect(out.usage.total_tokens).toBe(8);
  });
});
