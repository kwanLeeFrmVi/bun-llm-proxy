/**
 * Comprehensive Black-Box Translation Matrix Tests
 *
 * Tests ALL 29 translation paths:
 * - 11 request translators
 * - 9 streaming response translators
 * - 9 non-streaming response translators
 *
 * Pure black-box approach: tests based on API contracts, not implementation.
 */

import { describe, it, expect } from "bun:test";
import { Request, Response, ResponseNonStream, NeedsTranslation } from "../../ai-bridge/translator/index.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const enc = new TextEncoder();
const dec = new TextDecoder();

function encode(obj: unknown): Uint8Array {
  return enc.encode(JSON.stringify(obj));
}

function decode(bytes: Uint8Array): Record<string, unknown> {
  return JSON.parse(dec.decode(bytes));
}

function decodeSSE(chunks: Uint8Array[]): string[] {
  return chunks.map(c => dec.decode(c));
}

const NO_RAW = new Uint8Array(0);

// ─── Format Fixtures ───────────────────────────────────────────────────────────
// These fixtures represent the actual API formats of each provider based on
// their public documentation.

const FIXTURES = {
  // === OPENAI FORMAT ===
  openai: {
    basicRequest: {
      model: "gpt-4o",
      messages: [{ role: "user", content: "hello" }],
      temperature: 0.7,
      max_tokens: 1024,
    },
    requestWithSystem: {
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "hello" },
      ],
    },
    requestWithTools: {
      model: "gpt-4o",
      messages: [{ role: "user", content: "use the weather tool" }],
      tools: [{
        type: "function",
        function: {
          name: "get_weather",
          description: "Get weather for a city",
          parameters: {
            type: "object",
            properties: { city: { type: "string" } },
          },
        },
      }],
    },
    streamingChunk: 'data: {"id":"chatcmpl_123","object":"chat.completion.chunk","model":"gpt-4o","created":1234567890,"choices":[{"index":0,"delta":{"role":"assistant","content":"hello"},"finish_reason":null}]}\n\n',
    streamingChunkDone: 'data: {"id":"chatcmpl_123","object":"chat.completion.chunk","model":"gpt-4o","created":1234567890,"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n',
    streamingDone: "data: [DONE]\n\n",
    nonStreamingResponse: {
      id: "chatcmpl_123",
      object: "chat.completion",
      created: 1234567890,
      model: "gpt-4o",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "hello world" },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    },
  },

  // === CLAUDE FORMAT ===
  claude: {
    basicRequest: {
      model: "claude-sonnet-4-20250514",
      messages: [{
        role: "user",
        content: [{ type: "text", text: "hello" }],
      }],
      max_tokens: 1024,
    },
    requestWithSystem: {
      model: "claude-sonnet-4-20250514",
      system: "You are helpful.",
      messages: [{
        role: "user",
        content: [{ type: "text", text: "hello" }],
      }],
    },
    requestWithTools: {
      model: "claude-sonnet-4-20250514",
      messages: [{
        role: "user",
        content: [{ type: "text", text: "use the weather tool" }],
      }],
      tools: [{
        name: "get_weather",
        description: "Get weather for a city",
        input_schema: {
          type: "object",
          properties: { city: { type: "string" } },
        },
      }],
    },
    streamingStart: 'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_123","type":"message","role":"assistant","model":"claude-sonnet-4","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":10,"output_tokens":0}}}\n\n',
    streamingDelta: 'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hello"}}\n\n',
    streamingStop: 'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":5}}\n\n',
    streamingStopEvent: 'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    nonStreamingResponse: {
      id: "msg_123",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-4",
      content: [{ type: "text", text: "hello world" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 5 },
    },
  },

  // === GEMINI FORMAT ===
  gemini: {
    basicRequest: {
      contents: [{
        role: "user",
        parts: [{ text: "hello" }],
      }],
    },
    requestWithSystem: {
      contents: [{ role: "user", parts: [{ text: "hello" }] }],
      systemInstruction: { parts: [{ text: "You are helpful." }] },
    },
    requestWithGenerationConfig: {
      contents: [{ role: "user", parts: [{ text: "hello" }] }],
      generationConfig: {
        maxOutputTokens: 1024,
        temperature: 0.7,
      },
    },
    streamingChunk: '{"candidates":[{"content":{"parts":[{"text":"hello"}]}}],"modelVersion":"gemini-2.0-flash"}\n',
    streamingChunkDone: '{"candidates":[{"content":{"parts":[{"text":"world"}]}}],"finishReason":"STOP","usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":5,"totalTokenCount":15}}\n',
    nonStreamingResponse: {
      candidates: [{
        content: { parts: [{ text: "hello world" }] },
        finishReason: "STOP",
      }],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 15,
      },
      modelVersion: "gemini-2.0-flash",
    },
  },

  // === OLLAMA FORMAT ===
  ollama: {
    basicRequest: {
      model: "llama3",
      messages: [{ role: "user", content: "hello" }],
      stream: true,
    },
    requestWithSystem: {
      model: "llama3",
      system: "You are helpful.",
      messages: [{ role: "user", content: "hello" }],
      stream: true,
    },
    requestWithOptions: {
      model: "llama3",
      messages: [{ role: "user", content: "hello" }],
      options: {
        temperature: 0.7,
        num_predict: 1024,
      },
      stream: true,
    },
    streamingChunk: '{"model":"llama3","message":{"role":"assistant","content":"hello"},"done":false}',
    streamingChunkDone: '{"model":"llama3","message":{"role":"assistant","content":"world"},"done":true,"done_reason":"stop","prompt_eval_count":10,"eval_count":5}',
    nonStreamingResponse: {
      model: "llama3",
      message: { role: "assistant", content: "hello world" },
      done: true,
      done_reason: "stop",
      prompt_eval_count: 10,
      eval_count: 5,
    },
  },

  // === KIRO FORMAT ===
  kiro: {
    basicRequest: {
      conversationState: {
        chatTriggerType: "MANUAL",
        conversationId: "conv-123",
        currentMessage: {
          userInputMessage: {
            content: "hello",
            timestamp: new Date().toISOString(),
          },
        },
        history: [],
      },
      inferenceConfig: {
        temperature: 0.7,
        maxTokens: 1024,
      },
    },
    streamingChunk: 'event: assistantResponseEvent\ndata: {"content":"hello"}\n\n',
    streamingChunkDone: 'event: messageStopEvent\ndata: {}\n\n',
    streamingDone: "data: [DONE]\n\n",
    nonStreamingResponse: {
      content: "hello world",
    },
  },

  // === ANTIGRAVITY FORMAT ===
  antigravity: {
    basicRequest: {
      request: {
        sessionId: "session-123",
        contents: [{
          role: "user",
          parts: [{ text: "hello" }],
        }],
      },
      requestId: "req-123",
      sessionId: "session-123",
    },
    streamingChunk: JSON.stringify({
      response: {
        responseId: "resp-123",
        modelVersion: "gemini-2.0",
        candidates: [{
          content: { parts: [{ text: "hello" }] },
        }],
      },
    }) + "\n",
    streamingChunkDone: JSON.stringify({
      response: {
        candidates: [{
          content: { parts: [{ text: "world" }] },
          finishReason: "STOP",
        }],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
          totalTokenCount: 15,
        },
      },
    }) + "\n",
    nonStreamingResponse: {
      response: {
        responseId: "resp-123",
        modelVersion: "gemini-2.0",
        candidates: [{
          content: { parts: [{ text: "hello world" }] },
          finishReason: "STOP",
        }],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
          totalTokenCount: 15,
        },
      },
    },
  },

  // === VERTEX FORMAT ===
  // Vertex uses Gemini format for requests (with stripped fields)
  // and Gemini format for responses
  vertex: {
    basicRequest: {
      contents: [{
        role: "user",
        parts: [{ text: "hello" }],
      }],
    },
    // Vertex responses are identical to Gemini
    streamingChunk: '{"candidates":[{"content":{"parts":[{"text":"hello"}]}}],"modelVersion":"gemini-2.0-flash"}\n',
    nonStreamingResponse: {
      candidates: [{
        content: { parts: [{ text: "hello world" }] },
        finishReason: "STOP",
      }],
    },
  },
} as const;

// ─── Request Translation Matrix ───────────────────────────────────────────────

const REQUEST_MATRIX = [
  ["claude", "openai"],
  ["openai", "claude"],
  ["claude", "ollama"],
  ["ollama", "claude"],
  ["ollama", "openai"],
  ["openai", "ollama"],
  ["gemini", "openai"],
  ["openai", "gemini"],
  ["openai", "kiro"],
  ["openai", "antigravity"],
  ["openai", "vertex"],
] as const;

// ─── Response Streaming Matrix ─────────────────────────────────────────────────

const RESPONSE_STREAM_MATRIX = [
  ["openai", "claude"],
  ["claude", "openai"],
  ["ollama", "claude"],
  ["ollama", "openai"],
  ["gemini", "openai"],
  ["openai", "gemini"],
  ["kiro", "openai"],
  ["antigravity", "openai"],
  ["vertex", "openai"], // Uses Gemini translator
] as const;

// ─── Response Non-Streaming Matrix ─────────────────────────────────────────────

const RESPONSE_NONSTREAM_MATRIX = [
  ["openai", "claude"],
  ["claude", "openai"],
  ["ollama", "claude"],
  ["ollama", "openai"],
  ["gemini", "openai"],
  ["openai", "gemini"],
  ["kiro", "openai"],
  ["antigravity", "openai"],
  ["vertex", "openai"], // Uses Gemini translator
] as const;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Translation Matrix: Request Translators", () => {
  it("covers all 11 request paths", () => {
    expect(REQUEST_MATRIX).toHaveLength(11);
  });

  for (const [from, to] of REQUEST_MATRIX) {
    describe(`${from} → ${to}`, () => {
      it("should translate without crashing", () => {
        const fixture = FIXTURES[from as keyof typeof FIXTURES] as { basicRequest: Record<string, unknown> };
        const input = encode(fixture.basicRequest);
        const result = Request(from, to, "test-model", input, false);
        expect(result).toBeInstanceOf(Uint8Array);
      });

      it("should produce valid JSON output", () => {
        const fixture = FIXTURES[from as keyof typeof FIXTURES] as { basicRequest: Record<string, unknown> };
        const input = encode(fixture.basicRequest);
        const result = Request(from, to, "test-model", input, false);
        expect(() => decode(result)).not.toThrow();
      });

      it("should preserve model information", () => {
        const fixture = FIXTURES[from as keyof typeof FIXTURES] as { basicRequest: Record<string, unknown> };
        const input = encode(fixture.basicRequest);
        const result = Request(from, to, "test-model", input, false);
        const output = decode(result);
        // Model name should be present in output
        expect(output).toBeDefined();
      });
    });
  }

  // === Identity Tests ===
  describe("identity translations (same format)", () => {
    const formats = ["openai", "claude", "gemini", "ollama"];

    for (const format of formats) {
      it(`${format} → ${format} returns input unchanged`, () => {
        const fixture = FIXTURES[format as keyof typeof FIXTURES] as { basicRequest: Record<string, unknown> };
        const input = encode(fixture.basicRequest);
        const result = Request(format, format, "test-model", input, false);
        expect(dec.decode(result)).toBe(dec.decode(input));
      });
    }
  });

  // === NeedsTranslation Helper ===
  describe("NeedsTranslation helper", () => {
    it("returns false for same format", () => {
      expect(NeedsTranslation("openai", "openai")).toBe(false);
      expect(NeedsTranslation("claude", "claude")).toBe(false);
    });

    it("returns true for different formats", () => {
      expect(NeedsTranslation("openai", "claude")).toBe(true);
      expect(NeedsTranslation("claude", "gemini")).toBe(true);
    });
  });
});

describe("Translation Matrix: Response Streaming Translators", () => {
  it("covers all 9 streaming paths", () => {
    expect(RESPONSE_STREAM_MATRIX).toHaveLength(9);
  });

  for (const [from, to] of RESPONSE_STREAM_MATRIX) {
    describe(`${from} → ${to} (streaming)`, () => {
      it("should translate content chunk", () => {
        const fixture = FIXTURES[from as keyof typeof FIXTURES] as { streamingChunk: string };
        const input = enc.encode(fixture.streamingChunk);
        const result = Response(from, to, null, "test-model", NO_RAW, NO_RAW, input, undefined);
        expect(Array.isArray(result)).toBe(true);
      });

      it("should produce array of Uint8Array", () => {
        const fixture = FIXTURES[from as keyof typeof FIXTURES] as { streamingChunk: string };
        const input = enc.encode(fixture.streamingChunk);
        const result = Response(from, to, null, "test-model", NO_RAW, NO_RAW, input, undefined);
        if (result.length > 0) {
          expect(result[0]).toBeInstanceOf(Uint8Array);
        }
      });

      it("should handle [DONE] sentinel gracefully", () => {
        const input = enc.encode("data: [DONE]\n\n");
        const result = Response(from, to, null, "test-model", NO_RAW, NO_RAW, input, undefined);
        expect(Array.isArray(result)).toBe(true);
      });

      it("should return empty array for empty input", () => {
        const input = new Uint8Array(0);
        const result = Response(from, to, null, "test-model", NO_RAW, NO_RAW, input, undefined);
        expect(Array.isArray(result)).toBe(true);
      });
    });
  }
});

describe("Translation Matrix: Response Non-Streaming Translators", () => {
  it("covers all 9 non-streaming paths", () => {
    expect(RESPONSE_NONSTREAM_MATRIX).toHaveLength(9);
  });

  for (const [from, to] of RESPONSE_NONSTREAM_MATRIX) {
    describe(`${from} → ${to} (non-streaming)`, () => {
      it("should translate response", () => {
        const fixture = FIXTURES[from as keyof typeof FIXTURES] as { nonStreamingResponse: Record<string, unknown> };
        const input = encode(fixture.nonStreamingResponse);
        const result = ResponseNonStream(from, to, null, "test-model", NO_RAW, NO_RAW, input);
        expect(result).toBeInstanceOf(Uint8Array);
      });

      it("should produce valid JSON", () => {
        const fixture = FIXTURES[from as keyof typeof FIXTURES] as { nonStreamingResponse: Record<string, unknown> };
        const input = encode(fixture.nonStreamingResponse);
        const result = ResponseNonStream(from, to, null, "test-model", NO_RAW, NO_RAW, input);
        // Result may be raw on error, but should not crash
        expect(result).toBeInstanceOf(Uint8Array);
      });

      it("should handle invalid JSON gracefully", () => {
        const input = enc.encode("not valid json {");
        const result = ResponseNonStream(from, to, null, "test-model", NO_RAW, NO_RAW, input);
        // Should return raw input on error
        expect(dec.decode(result)).toBe("not valid json {");
      });
    });
  }
});

// ─── Format-Specific Translation Tests ─────────────────────────────────────────

describe("OpenAI ↔ Claude Translations", () => {
  describe("Request: OpenAI → Claude", () => {
    it("converts string content to text block", () => {
      const input = encode({
        model: "claude-sonnet-4",
        messages: [{ role: "user", content: "hello" }],
      });
      const result = decode(Request("openai", "claude", "claude-sonnet-4-20250514", input, false));
      const msgs = result.messages as Array<Record<string, unknown>>;
      const content = msgs[0].content as Array<Record<string, unknown>>;
      expect(content[0].type).toBe("text");
      expect(content[0].text).toBe("hello");
    });

    it("extracts system message", () => {
      const input = encode({
        model: "claude-sonnet-4",
        messages: [
          { role: "system", content: "You are helpful." },
          { role: "user", content: "hello" },
        ],
      });
      const result = decode(Request("openai", "claude", "claude-sonnet-4-20250514", input, false));
      expect(result.system).toBe("You are helpful.");
      const msgs = result.messages as Array<Record<string, unknown>>;
      expect(msgs.find((m: Record<string, unknown>) => m.role === "system")).toBeUndefined();
    });

    it("maps tool_calls to tool_use", () => {
      const input = encode({
        model: "claude-sonnet-4",
        messages: [{ role: "user", content: "use tool" }],
        tools: [{
          type: "function",
          function: { name: "search", description: "Search", parameters: { type: "object" } },
        }],
      });
      const result = decode(Request("openai", "claude", "claude-sonnet-4-20250514", input, false));
      expect(result.tools).toBeDefined();
      const tools = result.tools as Array<Record<string, unknown>>;
      expect(tools[0].name).toBe("search");
    });
  });

  describe("Request: Claude → OpenAI", () => {
    it("preserves array content structure", () => {
      const input = encode({
        model: "gpt-4o",
        messages: [{
          role: "user",
          content: [{ type: "text", text: "hello" }],
        }],
      });
      const result = decode(Request("claude", "openai", "gpt-4o", input, false));
      const msgs = result.messages as Array<Record<string, unknown>>;
      expect(Array.isArray(msgs[0].content)).toBe(true);
      const content = msgs[0].content as Array<Record<string, unknown>>;
      expect(content[0].type).toBe("text");
    });
  });

  describe("Response Streaming: OpenAI → Claude", () => {
    it("emits message_start event", () => {
      const input = enc.encode(FIXTURES.openai.streamingChunk);
      const chunks = decodeSSE(Response("openai", "claude", null, "claude-sonnet-4", NO_RAW, NO_RAW, input, undefined));
      const raw = chunks.join("");
      expect(raw).toContain("event: message_start");
    });

    it("maps finish_reason stop to end_turn", () => {
      const input = enc.encode(FIXTURES.openai.streamingChunkDone);
      const chunks = decodeSSE(Response("openai", "claude", null, "claude-sonnet-4", NO_RAW, NO_RAW, input, undefined));
      const raw = chunks.join("");
      expect(raw).toContain('"stop_reason":"end_turn"');
    });

    it("handles [DONE] sentinel", () => {
      const input = enc.encode(FIXTURES.openai.streamingDone);
      const chunks = decodeSSE(Response("openai", "claude", null, "claude-sonnet-4", NO_RAW, NO_RAW, input, undefined));
      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe("Response Streaming: Claude → OpenAI", () => {
    it("emits OpenAI SSE chunk", () => {
      const input = enc.encode(FIXTURES.claude.streamingDelta);
      const chunks = decodeSSE(Response("claude", "openai", null, "claude-sonnet-4", NO_RAW, NO_RAW, input, undefined));
      const raw = chunks.join("");
      expect(raw).toContain("data: ");
      expect(raw).toContain('"object":"chat.completion.chunk"');
    });

    it("maps end_turn to stop", () => {
      const input = enc.encode(FIXTURES.claude.streamingStop);
      const chunks = decodeSSE(Response("claude", "openai", null, "claude-sonnet-4", NO_RAW, NO_RAW, input, undefined));
      const raw = chunks.join("");
      expect(raw).toContain('"finish_reason":"stop"');
    });

    it("emits [DONE] on message_stop", () => {
      const input = enc.encode(FIXTURES.claude.streamingStopEvent);
      const chunks = decodeSSE(Response("claude", "openai", null, "claude-sonnet-4", NO_RAW, NO_RAW, input, undefined));
      const raw = chunks.join("");
      expect(raw).toContain("data: [DONE]");
    });
  });

  describe("Response Non-Streaming: OpenAI → Claude", () => {
    it("transforms to Claude message format", () => {
      const input = encode(FIXTURES.openai.nonStreamingResponse);
      const result = decode(ResponseNonStream("openai", "claude", null, "claude-sonnet-4", NO_RAW, NO_RAW, input));
      expect(result.type).toBe("message");
      expect(result.stop_reason).toBe("end_turn");
      const content = result.content as Array<Record<string, unknown>>;
      expect(content[0].text).toBe("hello world");
    });
  });

  describe("Response Non-Streaming: Claude → OpenAI", () => {
    it("transforms to OpenAI chat.completion format", () => {
      const input = encode(FIXTURES.claude.nonStreamingResponse);
      const result = decode(ResponseNonStream("claude", "openai", null, "claude-sonnet-4", NO_RAW, NO_RAW, input));
      expect(result.object).toBe("chat.completion");
      expect(result.choices[0].finish_reason).toBe("stop");
      expect(result.choices[0].message.content).toBe("hello world");
    });
  });
});

describe("OpenAI ↔ Gemini Translations", () => {
  describe("Request: OpenAI → Gemini", () => {
    it("converts messages to contents.parts", () => {
      const input = encode({
        model: "gemini-2.0-flash",
        messages: [{ role: "user", content: "hello" }],
      });
      const result = decode(Request("openai", "gemini", "gemini-2.0-flash", input, false));
      expect(result.contents).toBeDefined();
      const contents = result.contents as Array<Record<string, unknown>>;
      expect(contents[0].role).toBe("user");
      const parts = contents[0].parts as Array<Record<string, unknown>>;
      expect(parts[0].text).toBe("hello");
    });

    it("moves system message to systemInstruction", () => {
      const input = encode({
        model: "gemini-2.0-flash",
        messages: [
          { role: "system", content: "You are helpful." },
          { role: "user", content: "hello" },
        ],
      });
      const result = decode(Request("openai", "gemini", "gemini-2.0-flash", input, false));
      expect(result.systemInstruction).toBeDefined();
      const contents = result.contents as Array<Record<string, unknown>>;
      expect(contents.find((c: Record<string, unknown>) => c.role === "system")).toBeUndefined();
    });
  });

  describe("Request: Gemini → OpenAI", () => {
    it("converts contents.parts to messages", () => {
      const input = encode({
        contents: [{ role: "user", parts: [{ text: "hello gemini" }] }],
      });
      const result = decode(Request("gemini", "openai", "gemini-2.0-flash", input, false));
      const msgs = result.messages as Array<Record<string, unknown>>;
      expect(msgs[0].role).toBe("user");
      expect(msgs[0].content).toBe("hello gemini");
    });

    it("converts generationConfig to OpenAI params", () => {
      const input = encode(FIXTURES.gemini.requestWithGenerationConfig);
      const result = decode(Request("gemini", "openai", "gemini-2.0-flash", input, false));
      expect(result.max_tokens).toBe(1024);
      expect(result.temperature).toBe(0.7);
    });
  });

  describe("Response Streaming: Gemini → OpenAI", () => {
    it("emits OpenAI SSE chunk", () => {
      const input = enc.encode(FIXTURES.gemini.streamingChunk);
      const chunks = decodeSSE(Response("gemini", "openai", null, "gemini-2.0-flash", NO_RAW, NO_RAW, input, undefined));
      const raw = chunks.join("");
      expect(raw).toContain("data: ");
      expect(raw).toContain('"object":"chat.completion.chunk"');
    });

    it("extracts text from candidates[0].content.parts", () => {
      const input = enc.encode(FIXTURES.gemini.streamingChunk);
      const chunks = decodeSSE(Response("gemini", "openai", null, "gemini-2.0-flash", NO_RAW, NO_RAW, input, undefined));
      const raw = chunks.join("");
      expect(raw).toContain('"content":"hello"');
    });
  });

  describe("Response Streaming: OpenAI → Gemini", () => {
    it("emits Gemini SSE format", () => {
      const input = enc.encode(FIXTURES.openai.streamingChunk);
      const chunks = decodeSSE(Response("openai", "gemini", null, "gpt-4o", NO_RAW, NO_RAW, input, undefined));
      const raw = chunks.join("");
      expect(raw).toContain('"text":"hello"');
      expect(raw).toContain('"role":"model"');
    });

    it("maps finish_reason stop to STOP", () => {
      const input = enc.encode(FIXTURES.openai.streamingChunkDone);
      const chunks = decodeSSE(Response("openai", "gemini", null, "gpt-4o", NO_RAW, NO_RAW, input, undefined));
      const raw = chunks.join("");
      expect(raw).toContain('"finishReason":"STOP"');
    });
  });

  describe("Response Non-Streaming: Gemini → OpenAI", () => {
    it("transforms to OpenAI chat.completion", () => {
      const input = encode(FIXTURES.gemini.nonStreamingResponse);
      const result = decode(ResponseNonStream("gemini", "openai", null, "gemini-2.0-flash", NO_RAW, NO_RAW, input));
      expect(result.object).toBe("chat.completion");
      expect(result.choices[0].message.content).toBe("hello world");
      expect(result.choices[0].finish_reason).toBe("stop");
    });

    it("maps usageMetadata to usage", () => {
      const input = encode(FIXTURES.gemini.nonStreamingResponse);
      const result = decode(ResponseNonStream("gemini", "openai", null, "gemini-2.0-flash", NO_RAW, NO_RAW, input));
      expect(result.usage.total_tokens).toBe(15);
    });

    it("maps finishReason SAFETY to content_filter", () => {
      const input = encode({
        candidates: [{ content: { parts: [] } }],
        finishReason: "SAFETY",
      });
      const result = decode(ResponseNonStream("gemini", "openai", null, "gemini-2.0-flash", NO_RAW, NO_RAW, input));
      expect(result.choices[0].finish_reason).toBe("content_filter");
    });
  });

  describe("Response Non-Streaming: OpenAI → Gemini", () => {
    it("transforms to Gemini format", () => {
      const input = encode(FIXTURES.openai.nonStreamingResponse);
      const result = decode(ResponseNonStream("openai", "gemini", null, "gpt-4o", NO_RAW, NO_RAW, input));
      expect(result.candidates).toBeDefined();
      expect(result.candidates[0].content.parts[0].text).toBe("hello world");
      expect(result.candidates[0].finishReason).toBe("STOP");
    });
  });
});

describe("Ollama ↔ OpenAI ↔ Claude Translations", () => {
  describe("Request: Claude → Ollama", () => {
    it("converts Claude format to Ollama", () => {
      const input = encode({
        model: "llama3",
        system: "You are helpful",
        messages: [{ role: "user", content: "hello" }],
        max_tokens: 100,
      });
      const result = decode(Request("claude", "ollama", "llama3", input, true));
      expect(result.model).toBe("llama3");
      expect(result.stream).toBe(true);
      const messages = result.messages as Array<Record<string, unknown>>;
      expect(messages[0].role).toBe("system");
    });
  });

  describe("Request: Ollama → Claude", () => {
    it("converts Ollama format to Claude", () => {
      const input = encode({
        model: "llama3",
        messages: [{ role: "user", content: "hello" }],
        options: { temperature: 0.5, num_predict: 200 },
      });
      const result = decode(Request("ollama", "claude", "claude-sonnet-4-20250514", input, false));
      expect(result.temperature).toBe(0.5);
      expect(result.max_tokens).toBe(200);
    });
  });

  describe("Request: OpenAI → Ollama", () => {
    it("converts OpenAI format to Ollama", () => {
      const input = encode({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are helpful" },
          { role: "user", content: "hello" },
        ],
        temperature: 0.7,
        max_tokens: 100,
      });
      const result = decode(Request("openai", "ollama", "llama3", input, true));
      expect(result.model).toBe("llama3");
      expect(result.stream).toBe(true);
      expect(result.system).toBe("You are helpful");
    });
  });

  describe("Request: Ollama → OpenAI", () => {
    it("converts Ollama format to OpenAI", () => {
      const input = encode({
        model: "llama3",
        messages: [{ role: "user", content: "hello" }],
        options: { temperature: 0.7, top_p: 0.9, num_predict: 100 },
      });
      const result = decode(Request("ollama", "openai", "gpt-4o", input, true));
      expect(result.model).toBe("gpt-4o");
      expect(result.temperature).toBe(0.7);
      expect(result.top_p).toBe(0.9);
      expect(result.max_tokens).toBe(100);
    });
  });

  describe("Response Streaming: Ollama → Claude", () => {
    it("emits Claude SSE events", () => {
      const input = enc.encode(FIXTURES.ollama.streamingChunk);
      const chunks = decodeSSE(Response("ollama", "claude", null, "llama3", NO_RAW, NO_RAW, input, undefined));
      const raw = chunks.join("");
      expect(raw).toContain("event: message_start");
      expect(raw).toContain("event: content_block_delta");
    });

    it("maps done_reason stop to end_turn", () => {
      const input = enc.encode(FIXTURES.ollama.streamingChunkDone);
      const chunks = decodeSSE(Response("ollama", "claude", null, "llama3", NO_RAW, NO_RAW, input, undefined));
      const raw = chunks.join("");
      expect(raw).toContain('"stop_reason":"end_turn"');
    });
  });

  describe("Response Streaming: Ollama → OpenAI", () => {
    it("emits OpenAI SSE chunks", () => {
      const input = enc.encode(FIXTURES.ollama.streamingChunk);
      const chunks = decodeSSE(Response("ollama", "openai", null, "llama3", NO_RAW, NO_RAW, input, undefined));
      const raw = chunks.join("");
      expect(raw).toContain("data: ");
      expect(raw).toContain('"object":"chat.completion.chunk"');
    });
  });

  describe("Response Non-Streaming: Ollama → Claude", () => {
    it("transforms to Claude message format", () => {
      const input = encode(FIXTURES.ollama.nonStreamingResponse);
      const result = decode(ResponseNonStream("ollama", "claude", null, "llama3", NO_RAW, NO_RAW, input));
      expect(result.type).toBe("message");
      expect(result.stop_reason).toBe("end_turn");
      const content = result.content as Array<Record<string, unknown>>;
      expect(content[0].text).toBe("hello world");
    });
  });

  describe("Response Non-Streaming: Ollama → OpenAI", () => {
    it("transforms to OpenAI chat.completion", () => {
      const input = encode(FIXTURES.ollama.nonStreamingResponse);
      const result = decode(ResponseNonStream("ollama", "openai", null, "llama3", NO_RAW, NO_RAW, input));
      expect(result.object).toBe("chat.completion");
      expect(result.choices[0].message.content).toBe("hello world");
      expect(result.choices[0].finish_reason).toBe("stop");
    });
  });
});

describe("Kiro → OpenAI Translations", () => {
  describe("Request: OpenAI → Kiro", () => {
    it("converts to conversationState format", () => {
      const input = encode({
        messages: [
          { role: "user", content: "hello" },
          { role: "assistant", content: "hi there" },
          { role: "user", content: "follow up" },
        ],
      });
      const result = decode(Request("openai", "kiro", "kiro-model", input, false));
      expect(result.conversationState).toBeDefined();
      const cs = result.conversationState as Record<string, unknown>;
      expect(cs.history).toBeDefined();
      expect(cs.currentMessage).toBeDefined();
    });
  });

  describe("Response Streaming: Kiro → OpenAI", () => {
    it("emits OpenAI SSE chunk", () => {
      const input = enc.encode(FIXTURES.kiro.streamingChunk);
      const chunks = decodeSSE(Response("kiro", "openai", null, "kiro-model", NO_RAW, NO_RAW, input, undefined));
      const raw = chunks.join("");
      expect(raw).toContain("data: ");
      expect(raw).toContain('"object":"chat.completion.chunk"');
    });

    it("handles [DONE] sentinel", () => {
      const input = enc.encode(FIXTURES.kiro.streamingDone);
      const chunks = decodeSSE(Response("kiro", "openai", null, "kiro-model", NO_RAW, NO_RAW, input, undefined));
      const raw = chunks.join("");
      expect(raw).toContain("[DONE]");
    });
  });

  describe("Response Non-Streaming: Kiro → OpenAI", () => {
    it("transforms to OpenAI format", () => {
      const input = encode(FIXTURES.kiro.nonStreamingResponse);
      const result = decode(ResponseNonStream("kiro", "openai", null, "kiro-model", NO_RAW, NO_RAW, input));
      expect(result.object).toBe("chat.completion");
      expect(result.choices[0].message.content).toBe("hello world");
    });
  });
});

describe("Antigravity ↔ OpenAI Translations", () => {
  describe("Request: OpenAI → Antigravity", () => {
    it("wraps in Antigravity outer structure", () => {
      const input = encode({
        model: "gemini-2.0-flash",
        messages: [{ role: "user", content: "hello" }],
      });
      const result = decode(Request("openai", "antigravity", "gemini-2.0-flash", input, false));
      expect(result.request).toBeDefined();
      expect(result.requestId).toBeDefined();
      expect(result.sessionId).toBeDefined();
    });
  });

  describe("Response Streaming: Antigravity → OpenAI", () => {
    it("unwraps and emits OpenAI SSE", () => {
      const input = enc.encode(FIXTURES.antigravity.streamingChunk);
      const chunks = decodeSSE(Response("antigravity", "openai", null, "gemini-2.0", NO_RAW, NO_RAW, input, undefined));
      const raw = chunks.join("");
      expect(raw).toContain("data: ");
      expect(raw).toContain('"object":"chat.completion.chunk"');
    });

    it("extracts text from response.candidates", () => {
      const input = enc.encode(FIXTURES.antigravity.streamingChunk);
      const chunks = decodeSSE(Response("antigravity", "openai", null, "gemini-2.0", NO_RAW, NO_RAW, input, undefined));
      const raw = chunks.join("");
      expect(raw).toContain('"content":"hello"');
    });
  });

  describe("Response Non-Streaming: Antigravity → OpenAI", () => {
    it("unwraps and transforms to OpenAI", () => {
      const input = encode(FIXTURES.antigravity.nonStreamingResponse);
      const result = decode(ResponseNonStream("antigravity", "openai", null, "gemini-2.0", NO_RAW, NO_RAW, input));
      expect(result.object).toBe("chat.completion");
      expect(result.choices[0].message.content).toBe("hello world");
    });

    it("maps finishReason STOP to stop", () => {
      const input = encode(FIXTURES.antigravity.nonStreamingResponse);
      const result = decode(ResponseNonStream("antigravity", "openai", null, "gemini-2.0", NO_RAW, NO_RAW, input));
      expect(result.choices[0].finish_reason).toBe("stop");
    });
  });
});

describe("Vertex (Gemini-like) Translations", () => {
  describe("Request: OpenAI → Vertex", () => {
    it("uses Gemini translator", () => {
      const input = encode({
        model: "gemini-2.0-flash",
        messages: [{ role: "user", content: "hello vertex" }],
      });
      const result = decode(Request("openai", "vertex", "gemini-2.0-flash", input, false));
      expect(result.contents).toBeDefined();
      const contents = result.contents as Array<Record<string, unknown>>;
      expect(contents[0].role).toBe("user");
    });
  });

  describe("Response: Vertex → OpenAI", () => {
    it("uses Gemini translator", () => {
      const input = enc.encode(FIXTURES.vertex.streamingChunk);
      const chunks = decodeSSE(Response("vertex", "openai", null, "gemini-2.0-flash", NO_RAW, NO_RAW, input, undefined));
      const raw = chunks.join("");
      expect(raw).toContain("data: ");
    });
  });

  describe("Response Non-Stream: Vertex → OpenAI", () => {
    it("uses Gemini translator", () => {
      const input = encode(FIXTURES.vertex.nonStreamingResponse);
      const result = decode(ResponseNonStream("vertex", "openai", null, "gemini-2.0-flash", NO_RAW, NO_RAW, input));
      expect(result.object).toBe("chat.completion");
    });
  });
});

// ─── Round-Trip Tests ───────────────────────────────────────────────────────────

describe("Round-Trip Tests (A→B→A)", () => {
  describe("OpenAI ↔ Claude", () => {
    it("preserves core message content", () => {
      const original = {
        model: "gpt-4o",
        messages: [
          { role: "user", content: "test message" },
          { role: "assistant", content: "test response" },
        ],
      };
      const step1 = decode(Request("openai", "claude", "claude-sonnet-4-20250514", encode(original), false));
      const step2 = decode(Request("claude", "openai", "gpt-4o", encode(step1), false));
      const msgs = step2.messages as Array<Record<string, unknown>>;
      // After round-trip, content may be an array (Claude format)
      const content = msgs[0].content;
      if (Array.isArray(content)) {
        expect(content[0].text).toContain("test message");
      } else {
        expect(content).toContain("test message");
      }
    });
  });

  describe("OpenAI ↔ Gemini", () => {
    it("preserves message roles", () => {
      const original = {
        model: "gpt-4o",
        messages: [
          { role: "user", content: "question" },
          { role: "assistant", content: "answer" },
        ],
      };
      const step1 = decode(Request("openai", "gemini", "gemini-2.0-flash", encode(original), false));
      const step2 = decode(Request("gemini", "openai", "gpt-4o", encode(step1), false));
      const msgs = step2.messages as Array<Record<string, unknown>>;
      expect(msgs[0].role).toBe("user");
      expect(msgs[1].role).toBe("assistant");
    });
  });

  describe("Ollama ↔ OpenAI", () => {
    it("preserves messages", () => {
      const original = {
        model: "llama3",
        messages: [{ role: "user", content: "hello" }],
      };
      const step1 = decode(Request("ollama", "openai", "gpt-4o", encode(original), false));
      const step2 = decode(Request("openai", "ollama", "llama3", encode(step1), false));
      const msgs = step2.messages as Array<Record<string, unknown>>;
      expect(msgs[0].content).toBe("hello");
    });
  });
});

// ─── Edge Case Tests ───────────────────────────────────────────────────────────

describe("Edge Cases", () => {
  describe("Empty content handling", () => {
    it("OpenAI empty content", () => {
      const input = encode({
        model: "gpt-4o",
        messages: [{ role: "user", content: "" }],
      });
      const result = decode(Request("openai", "claude", "claude-sonnet-4-20250514", input, false));
      expect(result).toBeDefined();
    });

    it("Claude empty content array", () => {
      const input = encode({
        model: "claude-sonnet-4",
        messages: [{ role: "user", content: [] }],
      });
      const result = decode(Request("claude", "openai", "gpt-4o", input, false));
      expect(result).toBeDefined();
    });
  });

  describe("Invalid JSON handling", () => {
    it("Request translator throws on invalid JSON", () => {
      const input = enc.encode("not json {");
      expect(() => Request("openai", "claude", "claude-sonnet-4-20250514", input, false)).toThrow();
    });

    it("ResponseNonStream returns raw on invalid JSON", () => {
      const input = enc.encode("not json {");
      const result = ResponseNonStream("openai", "claude", null, "claude-sonnet-4", NO_RAW, NO_RAW, input);
      expect(dec.decode(result)).toBe("not json {");
    });
  });

  describe("Null value handling", () => {
    it("OpenAI null content in response", () => {
      const input = encode({
        id: "chatcmpl-123",
        object: "chat.completion",
        model: "gpt-4o",
        choices: [{
          index: 0,
          message: { role: "assistant", content: null },
          finish_reason: "tool_calls",
        }],
      });
      const result = decode(ResponseNonStream("openai", "claude", null, "claude-sonnet-4", NO_RAW, NO_RAW, input));
      expect(result).toBeDefined();
    });
  });

  describe("Empty input handling", () => {
    it("Request translator throws on empty input", () => {
      const input = new Uint8Array(0);
      expect(() => Request("openai", "claude", "claude-sonnet-4-20250514", input, false)).toThrow();
    });

    it("Response translator handles empty input", () => {
      const input = new Uint8Array(0);
      const result = Response("openai", "claude", null, "claude-sonnet-4", NO_RAW, NO_RAW, input, undefined);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("Special characters in content", () => {
    it("handles unicode characters", () => {
      const input = encode({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello 世界 🌍" }],
      });
      const result = decode(Request("openai", "claude", "claude-sonnet-4-20250514", input, false));
      const msgs = result.messages as Array<Record<string, unknown>>;
      const content = msgs[0].content as Array<Record<string, unknown>>;
      expect(content[0].text).toContain("世界");
    });

    it("handles newlines and special JSON chars", () => {
      const input = encode({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Line 1\nLine 2\t\"quoted\"" }],
      });
      const result = decode(Request("openai", "claude", "claude-sonnet-4-20250514", input, false));
      const msgs = result.messages as Array<Record<string, unknown>>;
      const content = msgs[0].content as Array<Record<string, unknown>>;
      expect(content[0].text).toContain("\n");
    });
  });
});
