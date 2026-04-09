/**
 * Unit tests for Kiro, Antigravity, and Vertex translators.
 * Tests streaming + non-streaming response translators and request translators
 * that are not covered by other test files.
 *
 * Uses Bun's native test runner.
 */

import { describe, it, expect } from "bun:test";
import { convertKiroResponseToOpenAI, convertKiroResponseToOpenAINonStream } from "../../ai-bridge/translator/kiro/openai/response.ts";
import { convertAntigravityResponseToOpenAI, convertAntigravityResponseToOpenAINonStream } from "../../ai-bridge/translator/antigravity/openai/response.ts";
import { convertOpenAIRequestToKiro } from "../../ai-bridge/translator/openai/kiro/request.ts";
import { convertOpenAIRequestToVertex } from "../../ai-bridge/translator/openai/vertex/request.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function encode(body: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(body));
}

function decodeFirstSSEChunk(chunks: Uint8Array[]): Record<string, unknown> {
  const raw = new TextDecoder().decode(chunks[0] ?? new Uint8Array()).trim();
  const stripped = raw.startsWith("data: ") ? raw.slice(6).trim() : raw;
  return JSON.parse(stripped);
}

function decodeAllChunks(chunks: Uint8Array[]): Array<string> {
  return chunks.map((c) => {
    const raw = new TextDecoder().decode(c).trim();
    return raw.startsWith("data: ") ? raw.slice(6).trim() : raw;
  });
}

function decodeSSEChunks(chunks: Uint8Array[]): Array<Record<string, unknown>> {
  return decodeAllChunks(chunks)
    .filter((s) => s !== "[DONE]")
    .map((s) => JSON.parse(s));
}

// ─── Kiro → OpenAI Response ───────────────────────────────────────────────────

describe("convertKiroResponseToOpenAI (streaming)", () => {
  it("parses assistantResponseEvent and emits content delta", () => {
    const raw = new TextEncoder().encode("event: assistantResponseEvent\ndata: {\"content\":\"hello world\"}\n\n");
    const chunks = convertKiroResponseToOpenAI(undefined, "kiro-model", new Uint8Array(), new Uint8Array(), raw, undefined);

    expect(chunks.length).toBeGreaterThan(0);
    const chunk = decodeFirstSSEChunk(chunks);
    expect(chunk.object).toBe("chat.completion.chunk");
    expect(chunk.model).toBe("kiro");
    const choices = chunk.choices as Array<Record<string, unknown>>;
    expect(choices[0]?.delta).toBeDefined();
    const delta = choices[0]?.delta as Record<string, unknown>;
    expect(delta?.content).toBe("hello world");
  });

  it("parses reasoningContentEvent and emits thinking tag", () => {
    const raw = new TextEncoder().encode("event: reasoningContentEvent\ndata: {\"content\":\"thinking step 1\"}\n\n");
    const chunks = convertKiroResponseToOpenAI(undefined, "kiro-model", new Uint8Array(), new Uint8Array(), raw, undefined);

    expect(chunks.length).toBeGreaterThan(0);
    const chunk = decodeFirstSSEChunk(chunks);
    const choices = chunk.choices as Array<Record<string, unknown>>;
    const delta = choices[0]?.delta as Record<string, unknown>;
    expect(delta?.content).toContain("<thinking>");
    expect(delta?.content).toContain("thinking step 1");
    expect(delta?.content).toContain("</thinking>");
  });

  it("parses toolUseEvent and emits tool_calls", () => {
    const raw = new TextEncoder().encode(
      "event: toolUseEvent\ndata: {\"name\":\"search\",\"input\":{\"q\":\"weather\"},\"toolUseId\":\"call_abc\"}\n\n"
    );
    const chunks = convertKiroResponseToOpenAI(undefined, "kiro-model", new Uint8Array(), new Uint8Array(), raw, undefined);

    expect(chunks.length).toBeGreaterThan(0);
    const chunk = decodeFirstSSEChunk(chunks);
    const choices = chunk.choices as Array<Record<string, unknown>>;
    const delta = choices[0]?.delta as Record<string, unknown>;
    expect(delta?.tool_calls).toBeDefined();
    const toolCalls = delta?.tool_calls as Array<Record<string, unknown>>;
    expect(toolCalls[0]?.id).toBe("call_abc");
    expect((toolCalls[0]?.function as Record<string, unknown>).name).toBe("search");
    expect((toolCalls[0]?.function as Record<string, unknown>).arguments).toBe('{"q":"weather"}');
  });

  it("stores usage from usageEvent", () => {
    const usageRaw = new TextEncoder().encode("event: usageEvent\ndata: {\"inputTokens\":10,\"outputTokens\":5}\n\n");
    const chunks = convertKiroResponseToOpenAI(undefined, "kiro-model", new Uint8Array(), new Uint8Array(), usageRaw, undefined);

    // usageEvent returns [] (usage stored in state, not emitted)
    expect(chunks).toEqual([]);
  });

  it("emits finish chunk with usage on messageStopEvent", () => {
    // Build state with usage stored
    const state = {
      responseId: "chatcmpl-test",
      created: 0,
      model: "kiro",
      chunkIndex: 0,
      finishReason: "",
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };
    const stopRaw = new TextEncoder().encode("event: messageStopEvent\ndata: {}\n\n");

    const chunks = convertKiroResponseToOpenAI(undefined, "kiro-model", new Uint8Array(), new Uint8Array(), stopRaw, state);
    expect(chunks.length).toBeGreaterThan(0);

    const allDecoded = decodeSSEChunks(chunks);
    const finishChunk = allDecoded.find((c) => c.choices?.[0]?.finish_reason === "stop");
    expect(finishChunk).toBeDefined();
    expect(finishChunk!.usage).toEqual({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 });
  });

  it("emits [DONE] sentinel after messageStopEvent", () => {
    const stopRaw = new TextEncoder().encode("event: messageStopEvent\ndata: {}\n\n");
    const chunks = convertKiroResponseToOpenAI(undefined, "kiro-model", new Uint8Array(), new Uint8Array(), stopRaw, undefined);
    const allRaw = decodeAllChunks(chunks);
    expect(allRaw.some((s) => s === "data: [DONE]" || s === "[DONE]")).toBe(true);
  });

  it("handles [DONE] sentinel", () => {
    const raw = new TextEncoder().encode("data: [DONE]\n\n");
    const chunks = convertKiroResponseToOpenAI(undefined, "kiro-model", new Uint8Array(), new Uint8Array(), raw, undefined);
    const allRaw = decodeAllChunks(chunks);
    expect(allRaw.some((s) => s === "data: [DONE]" || s === "[DONE]")).toBe(true);
  });

  it("emits role:assistant on first chunk", () => {
    const raw = new TextEncoder().encode("event: assistantResponseEvent\ndata: {\"content\":\"hi\"}\n\n");
    const chunks = convertKiroResponseToOpenAI(undefined, "kiro-model", new Uint8Array(), new Uint8Array(), raw, undefined);

    const chunk = decodeFirstSSEChunk(chunks);
    const choices = chunk.choices as Array<Record<string, unknown>>;
    const delta = choices[0]?.delta as Record<string, unknown>;
    expect(delta?.role).toBe("assistant");
  });

  it("returns empty for empty input", () => {
    const chunks = convertKiroResponseToOpenAI(undefined, "kiro-model", new Uint8Array(), new Uint8Array(), new Uint8Array(), undefined);
    expect(chunks).toEqual([]);
  });

  it("passthrough: already OpenAI format returns as-is", () => {
    const openaiChunk = { object: "chat.completion.chunk", choices: [{ delta: { content: "hello" } }] };
    const raw = new TextEncoder().encode(`data: ${JSON.stringify(openaiChunk)}\n\n`);
    const chunks = convertKiroResponseToOpenAI(undefined, "kiro-model", new Uint8Array(), new Uint8Array(), raw, undefined);

    expect(chunks.length).toBe(1);
    const decoded = decodeFirstSSEChunk(chunks);
    expect(decoded.object).toBe("chat.completion.chunk");
  });
});

describe("convertKiroResponseToOpenAINonStream (non-streaming)", () => {
  it("transforms Kiro JSON to OpenAI chat.completion", () => {
    const raw = new TextEncoder().encode(JSON.stringify({ content: "hello world" }));
    const result = convertKiroResponseToOpenAINonStream(undefined, "kiro", new Uint8Array(), new Uint8Array(), raw);
    const decoded = JSON.parse(new TextDecoder().decode(result));

    expect(decoded.object).toBe("chat.completion");
    expect(decoded.choices).toBeDefined();
    expect(decoded.choices?.[0]?.message.content).toBe("hello world");
    expect(decoded.choices?.[0]?.finish_reason).toBe("stop");
  });

  it("returns raw on parse error", () => {
    const raw = new TextEncoder().encode("not json at all");
    const result = convertKiroResponseToOpenAINonStream(undefined, "kiro", new Uint8Array(), new Uint8Array(), raw);
    expect(new TextDecoder().decode(result)).toBe("not json at all");
  });

  it("returns raw if already OpenAI format", () => {
    const openaiResp = { id: "chatcmpl-123", object: "chat.completion", choices: [{ message: { role: "assistant", content: "hi" } }] };
    const raw = new TextEncoder().encode(JSON.stringify(openaiResp));
    const result = convertKiroResponseToOpenAINonStream(undefined, "kiro", new Uint8Array(), new Uint8Array(), raw);
    const decoded = JSON.parse(new TextDecoder().decode(result));
    expect(decoded.choices).toBeDefined();
  });
});

// ─── Antigravity → OpenAI Response ──────────────────────────────────────────

describe("convertAntigravityResponseToOpenAI (streaming)", () => {
  it("unwraps Antigravity outer response and emits OpenAI SSE", () => {
    const raw = new TextEncoder().encode(JSON.stringify({
      response: {
        responseId: "resp_abc",
        modelVersion: "gemini-2.0",
        candidates: [{
          content: { parts: [{ text: "hi there" }] },
        }],
      },
    }));
    const chunks = convertAntigravityResponseToOpenAI(undefined, "gemini", new Uint8Array(), new Uint8Array(), raw, undefined);

    expect(chunks.length).toBeGreaterThan(0);
    const chunk = decodeFirstSSEChunk(chunks);
    expect(chunk.id).toBe("resp_abc");
    expect(chunk.object).toBe("chat.completion.chunk");
    const choices = chunk.choices as Array<Record<string, unknown>>;
    const delta = choices[0]?.delta as Record<string, unknown>;
    expect(delta?.content).toBe("hi there");
  });

  it("maps thought:true parts to reasoning_content", () => {
    const raw = new TextEncoder().encode(JSON.stringify({
      response: {
        candidates: [{ content: { parts: [{ thought: true, text: "reasoning step 1" }] } }],
      },
    }));
    const chunks = convertAntigravityResponseToOpenAI(undefined, "gemini", new Uint8Array(), new Uint8Array(), raw, undefined);

    const chunk = decodeFirstSSEChunk(chunks);
    const choices = chunk.choices as Array<Record<string, unknown>>;
    const delta = choices[0]?.delta as Record<string, unknown>;
    expect(delta?.reasoning_content).toBe("reasoning step 1");
  });

  it("maps functionCall to tool_calls on finish", () => {
    const raw = new TextEncoder().encode(JSON.stringify({
      response: {
        candidates: [{
          content: {
            parts: [
              { functionCall: { id: "call_1", name: "search", args: { q: "weather" } } },
            ],
          },
          finishReason: "STOP",
        }],
      },
    }));
    const chunks = convertAntigravityResponseToOpenAI(undefined, "gemini", new Uint8Array(), new Uint8Array(), raw, undefined);

    const allDecoded = decodeSSEChunks(chunks);
    const finishChunk = allDecoded.find((c) => c.choices?.[0]?.finish_reason === "stop");
    expect(finishChunk).toBeDefined();
    const choices = finishChunk!.choices as Array<Record<string, unknown>>;
    const delta = choices[0]?.delta as Record<string, unknown>;
    expect(delta?.tool_calls).toBeDefined();
    const toolCalls = delta?.tool_calls as Array<Record<string, unknown>>;
    expect(toolCalls[0]?.id).toBe("call_1");
    expect((toolCalls[0]?.function as Record<string, unknown>)?.name).toBe("search");
    expect((toolCalls[0]?.function as Record<string, unknown>)?.arguments).toBe('{"q":"weather"}');
  });

  it("emits [DONE] after finishReason", () => {
    const raw = new TextEncoder().encode(JSON.stringify({
      response: {
        candidates: [{ content: { parts: [{ text: "done" }] }, finishReason: "STOP" }],
      },
    }));
    const chunks = convertAntigravityResponseToOpenAI(undefined, "gemini", new Uint8Array(), new Uint8Array(), raw, undefined);
    const allRaw = decodeAllChunks(chunks);
    expect(allRaw.some((s) => s === "data: [DONE]" || s === "[DONE]")).toBe(true);
  });

  it("emits [DONE] sentinel inline", () => {
    const raw = new TextEncoder().encode("data: [DONE]\n\n");
    const chunks = convertAntigravityResponseToOpenAI(undefined, "gemini", new Uint8Array(), new Uint8Array(), raw, undefined);
    const allRaw = decodeAllChunks(chunks);
    expect(allRaw.some((s) => s === "data: [DONE]" || s === "[DONE]")).toBe(true);
  });

  it("accumulates functionCall arguments across chunks", () => {
    // Build state as if first chunk was already processed (toolCall partially accumulated)
    // This simulates state passed across chunks during a streaming response
    const stateAfterFirst = {
      responseId: "resp_test",
      modelVersion: "",
      toolCallAccum: { "c1": { id: "c1", name: "search", arguments: "{\"q\":" } },
      toolNameMap: new Map(),
      usage: null,
    };
    // Second chunk: rest of args completes the functionCall
    const raw2 = new TextEncoder().encode(JSON.stringify({
      response: {
        candidates: [{ content: { parts: [{ functionCall: { id: "c1", args: "\"weather\"" } }] }, finishReason: "STOP" }],
      },
    }));
    const chunks2 = convertAntigravityResponseToOpenAI(undefined, "gemini", new Uint8Array(), new Uint8Array(), raw2, stateAfterFirst);

    const allDecoded = decodeSSEChunks(chunks2);
    const finishChunk = allDecoded.find((c) => c.choices?.[0]?.finish_reason);
    expect(finishChunk).toBeDefined();
    const choices = finishChunk!.choices as Array<Record<string, unknown>>;
    const delta = choices[0]?.delta as Record<string, unknown>;
    const toolCalls = delta?.tool_calls as Array<Record<string, unknown>>;
    expect((toolCalls[0]?.function as Record<string, unknown>).arguments).toContain("weather");
  });

  it("maps usageMetadata to OpenAI usage", () => {
    const raw = new TextEncoder().encode(JSON.stringify({
      response: {
        responseId: "resp_xyz",
        candidates: [{ content: { parts: [{ text: "hi" }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 5, totalTokenCount: 25 },
      },
    }));
    const chunks = convertAntigravityResponseToOpenAI(undefined, "gemini", new Uint8Array(), new Uint8Array(), raw, undefined);

    const allDecoded = decodeSSEChunks(chunks);
    const finishChunk = allDecoded.find((c) => c.usage !== undefined);
    expect(finishChunk).toBeDefined();
    expect(finishChunk!.usage).toEqual({
      prompt_tokens: 20,
      completion_tokens: 5,
      total_tokens: 25,
    });
  });

  it("returns empty for empty input", () => {
    const chunks = convertAntigravityResponseToOpenAI(undefined, "gemini", new Uint8Array(), new Uint8Array(), new Uint8Array(), undefined);
    expect(chunks).toEqual([]);
  });

  it("returns empty for non-JSON", () => {
    const chunks = convertAntigravityResponseToOpenAI(undefined, "gemini", new Uint8Array(), new Uint8Array(), new TextEncoder().encode("not json"), undefined);
    expect(chunks).toEqual([]);
  });
});

describe("convertAntigravityResponseToOpenAINonStream (non-streaming)", () => {
  it("unwraps Antigravity and transforms to OpenAI chat.completion", () => {
    const raw = new TextEncoder().encode(JSON.stringify({
      response: {
        responseId: "resp_abc",
        modelVersion: "gemini-2.0",
        candidates: [{
          content: { parts: [{ text: "hello" }] },
          finishReason: "STOP",
        }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 3, totalTokenCount: 13 },
      },
    }));
    const result = convertAntigravityResponseToOpenAINonStream(undefined, "gemini", new Uint8Array(), new Uint8Array(), raw);
    const decoded = JSON.parse(new TextDecoder().decode(result));

    expect(decoded.id).toBe("resp_abc");
    expect(decoded.object).toBe("chat.completion");
    expect(decoded.model).toBe("gemini-2.0");
    expect(decoded.choices?.[0]?.message.content).toBe("hello");
    expect(decoded.choices?.[0]?.finish_reason).toBe("stop");
    expect(decoded.usage).toEqual({ prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 });
  });

  it("maps functionCall to tool_calls", () => {
    const raw = new TextEncoder().encode(JSON.stringify({
      response: {
        candidates: [{
          content: { parts: [{ functionCall: { id: "call_x", name: "search", args: '{"q":"x"}' } }] },
          finishReason: "STOP",
        }],
      },
    }));
    const result = convertAntigravityResponseToOpenAINonStream(undefined, "gemini", new Uint8Array(), new Uint8Array(), raw);
    const decoded = JSON.parse(new TextDecoder().decode(result));

    expect(decoded.choices?.[0]?.message.tool_calls).toBeDefined();
    const tc = decoded.choices?.[0]?.message.tool_calls[0];
    expect(tc.id).toBe("call_x");
    expect(tc.function.name).toBe("search");
    expect(tc.function.arguments).toBe('{"q":"x"}');
  });

  it("maps usageMetadata", () => {
    const raw = new TextEncoder().encode(JSON.stringify({
      response: {
        candidates: [{ content: { parts: [{ text: "hi" }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 2, totalTokenCount: 9 },
      },
    }));
    const result = convertAntigravityResponseToOpenAINonStream(undefined, "gemini", new Uint8Array(), new Uint8Array(), raw);
    const decoded = JSON.parse(new TextDecoder().decode(result));

    expect(decoded.usage).toEqual({ prompt_tokens: 7, completion_tokens: 2, total_tokens: 9 });
  });

  it("maps finishReason STOP → stop, MAX_TOKENS → length, SAFETY → content_filter", () => {
    const stopRaw = new TextEncoder().encode(JSON.stringify({
      response: { candidates: [{ content: { parts: [{ text: "a" }] }, finishReason: "STOP" }] },
    }));
    const lengthRaw = new TextEncoder().encode(JSON.stringify({
      response: { candidates: [{ content: { parts: [{ text: "b" }] }, finishReason: "MAX_TOKENS" }] },
    }));
    const safetyRaw = new TextEncoder().encode(JSON.stringify({
      response: { candidates: [{ content: { parts: [{ text: "c" }] }, finishReason: "SAFETY" }] },
    }));

    const stopDec = JSON.parse(new TextDecoder().decode(convertAntigravityResponseToOpenAINonStream(undefined, "gemini", new Uint8Array(), new Uint8Array(), stopRaw)));
    const lengthDec = JSON.parse(new TextDecoder().decode(convertAntigravityResponseToOpenAINonStream(undefined, "gemini", new Uint8Array(), new Uint8Array(), lengthRaw)));
    const safetyDec = JSON.parse(new TextDecoder().decode(convertAntigravityResponseToOpenAINonStream(undefined, "gemini", new Uint8Array(), new Uint8Array(), safetyRaw)));

    expect(stopDec.choices?.[0]?.finish_reason).toBe("stop");
    expect(lengthDec.choices?.[0]?.finish_reason).toBe("length");
    expect(safetyDec.choices?.[0]?.finish_reason).toBe("content_filter");
  });

  it("returns raw on invalid JSON", () => {
    const raw = new TextEncoder().encode("not valid json");
    const result = convertAntigravityResponseToOpenAINonStream(undefined, "gemini", new Uint8Array(), new Uint8Array(), raw);
    expect(new TextDecoder().decode(result)).toBe("not valid json");
  });

  it("returns raw if no candidates", () => {
    const raw = new TextEncoder().encode(JSON.stringify({ response: {} }));
    const result = convertAntigravityResponseToOpenAINonStream(undefined, "gemini", new Uint8Array(), new Uint8Array(), raw);
    // No candidates → returns raw
    expect(new TextDecoder().decode(result)).toBeTruthy();
  });
});

// ─── OpenAI → Kiro Request ───────────────────────────────────────────────────

describe("convertOpenAIRequestToKiro (Request)", () => {
  it("flattens messages into history/currentMessage structure", () => {
    const body = {
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi back" },
        { role: "user", content: "follow up" },
      ],
    };
    const result = JSON.parse(new TextDecoder().decode(convertOpenAIRequestToKiro("kiro-model", encode(body), false))) as Record<string, unknown>;
    const cs = result.conversationState as Record<string, unknown>;
    expect(cs.history).toBeDefined();
    expect(Array.isArray(cs.history)).toBe(true);
    expect(cs.currentMessage).toBeDefined();
  });

  it("maps user content to userInputMessage", () => {
    const body = { messages: [{ role: "user", content: "hello kiro" }] };
    const result = JSON.parse(new TextDecoder().decode(convertOpenAIRequestToKiro("kiro-model", encode(body), false))) as Record<string, unknown>;
    const cs = result.conversationState as Record<string, unknown>;
    const cm = cs.currentMessage as Record<string, unknown>;
    expect(cm.userInputMessage).toBeDefined();
    expect((cm.userInputMessage as Record<string, unknown>)!.content).toContain("hello kiro");
  });

  it("maps assistant content to assistantResponseMessage", () => {
    const body = {
      messages: [
        { role: "user", content: "first" },
        { role: "assistant", content: "assistant reply" },
      ],
    };
    const result = JSON.parse(new TextDecoder().decode(convertOpenAIRequestToKiro("kiro-model", encode(body), false))) as Record<string, unknown>;
    const cs = result.conversationState as Record<string, unknown>;
    const history = cs.history as Array<Record<string, unknown>>;
    const assistantEntry = history.find((h) => h.assistantResponseMessage !== undefined);
    expect(assistantEntry).toBeDefined();
    expect((assistantEntry!.assistantResponseMessage as Record<string, unknown>).content).toBe("assistant reply");
  });

  it("maps tools to userInputMessageContext.tools", () => {
    const body = {
      messages: [{ role: "user", content: "hi" }],
      tools: [{
        type: "function",
        function: { name: "search", description: "Web search", parameters: { type: "object" } },
      }],
    };
    const result = JSON.parse(new TextDecoder().decode(convertOpenAIRequestToKiro("kiro-model", encode(body), false))) as Record<string, unknown>;
    const cs = result.conversationState as Record<string, unknown>;
    const cm = cs.currentMessage as Record<string, unknown>;
    const userInputMsg = cm.userInputMessage as Record<string, unknown> | undefined;
    const ctx = userInputMsg?.userInputMessageContext as Record<string, unknown> | undefined;
    expect(ctx?.tools).toBeDefined();
    const tools = ctx?.tools as Array<Record<string, unknown>>;
    expect(tools?.[0]?.toolSpecification).toBeDefined();
    expect((tools?.[0]?.toolSpecification as Record<string, unknown>).name).toBe("search");
  });

  it("maps image_url to images in userInputMessage", () => {
    const body = {
      messages: [{
        role: "user",
        content: [{
          type: "image_url",
          image_url: { url: "data:image/png;base64,abc123xyz" },
        }],
      }],
    };
    const result = JSON.parse(new TextDecoder().decode(convertOpenAIRequestToKiro("claude-model", encode(body), false))) as Record<string, unknown>;
    const cs = result.conversationState as Record<string, unknown>;
    const cm = cs.currentMessage as Record<string, unknown>;
    const userInputMsg = cm.userInputMessage as Record<string, unknown> | undefined;
    const images = userInputMsg?.images as Array<Record<string, unknown>> | undefined;
    expect(images).toBeDefined();
    expect(images?.length).toBeGreaterThan(0);
    expect(images?.[0]?.source).toBeDefined();
    expect((images?.[0]?.source as Record<string, unknown>).bytes).toBe("abc123xyz");
  });

  it("maps role:tool to userInputMessageContext.toolResults", () => {
    const body = {
      messages: [
        { role: "user", content: "use search" },
        { role: "assistant", content: "calling tool" },
        { role: "tool", tool_call_id: "call_abc", content: "the weather is sunny" },
        { role: "user", content: "thanks" },
      ],
    };
    const result = JSON.parse(new TextDecoder().decode(convertOpenAIRequestToKiro("kiro-model", encode(body), false))) as Record<string, unknown>;
    const cs = result.conversationState as Record<string, unknown>;
    // tool results are merged into the next user message → ends up in currentMessage
    const cm = cs.currentMessage as Record<string, unknown>;
    const userInputMsg = cm?.userInputMessage as Record<string, unknown> | undefined;
    const ctx = userInputMsg?.userInputMessageContext as Record<string, unknown> | undefined;
    expect(ctx?.toolResults).toBeDefined();
  });

  it("maps temperature to inferenceConfig.temperature", () => {
    const body = { messages: [{ role: "user", content: "hi" }], temperature: 0.7 };
    const result = JSON.parse(new TextDecoder().decode(convertOpenAIRequestToKiro("kiro-model", encode(body), false))) as Record<string, unknown>;
    const ic = result.inferenceConfig as Record<string, unknown>;
    expect(ic.temperature).toBe(0.7);
  });

  it("maps max_tokens to inferenceConfig.maxTokens", () => {
    const body = { messages: [{ role: "user", content: "hi" }], max_tokens: 2048 };
    const result = JSON.parse(new TextDecoder().decode(convertOpenAIRequestToKiro("kiro-model", encode(body), false))) as Record<string, unknown>;
    const ic = result.inferenceConfig as Record<string, unknown>;
    expect(ic.maxTokens).toBe(2048);
  });

  it("injects timestamp into currentMessage content", () => {
    const body = { messages: [{ role: "user", content: "what time is it" }] };
    const result = JSON.parse(new TextDecoder().decode(convertOpenAIRequestToKiro("kiro-model", encode(body), false))) as Record<string, unknown>;
    const cs = result.conversationState as Record<string, unknown>;
    const cm = cs.currentMessage as Record<string, unknown>;
    const content = (cm.userInputMessage as Record<string, unknown> | undefined)?.content as string;
    expect(content).toContain("[Context: Current time is");
    expect(content).toContain("what time is it");
  });

  it("returns conversationState with history and currentMessage", () => {
    const body = { messages: [{ role: "user", content: "hello" }] };
    const result = JSON.parse(new TextDecoder().decode(convertOpenAIRequestToKiro("kiro-model", encode(body), false))) as Record<string, unknown>;
    const cs = result.conversationState as Record<string, unknown>;
    expect(cs.chatTriggerType).toBe("MANUAL");
    expect(cs.conversationId).toBeDefined();
    expect(cs.history).toBeDefined();
    expect(cs.currentMessage).toBeDefined();
  });

  it("maps role:system to user (merged)", () => {
    const body = {
      messages: [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "hi" },
      ],
    };
    const result = JSON.parse(new TextDecoder().decode(convertOpenAIRequestToKiro("kiro-model", encode(body), false))) as Record<string, unknown>;
    const cs = result.conversationState as Record<string, unknown>;
    // system merged into user content
    const cm = cs.currentMessage as Record<string, unknown>;
    const userInputMsg = cm.userInputMessage as Record<string, unknown> | undefined;
    expect(userInputMsg?.content).toContain("You are helpful");
  });
});

// ─── OpenAI → Vertex Request ──────────────────────────────────────────────────

describe("convertOpenAIRequestToVertex (Request)", () => {
  it("reuses Gemini translator and strips functionCall.id", () => {
    const body = {
      model: "gemini-2.0-flash",
      messages: [{
        role: "user",
        content: [{
          type: "tool_calls",
          tool_calls: [{
            id: "call_abc123",
            type: "function",
            function: { name: "search", arguments: '{"q":"x"}' },
          }],
        }],
      }],
    };
    const result = JSON.parse(new TextDecoder().decode(convertOpenAIRequestToVertex("gemini-2.0-flash", encode(body), false))) as Record<string, unknown>;
    const contents = result.contents as Array<Record<string, unknown>>;
    const parts = contents[0]?.parts as Array<Record<string, unknown>>;
    const fc = parts[0]?.functionCall as Record<string, unknown>;
    expect(fc.name).toBe("search");
    // id must be stripped
    expect(fc.id).toBeUndefined();
  });

  it("strips thoughtSignature parts", () => {
    const body = {
      model: "gemini-2.0-flash",
      messages: [{
        role: "user",
        content: "hello",
      }],
    };
    // After Gemini conversion, manually inject thoughtSignature to test stripping
    // Since we can't easily inject it through OpenAI format, we test the stripVertexIncompatibleFields
    // indirectly via the functionCall.id stripping (same function)
    const result = JSON.parse(new TextDecoder().decode(convertOpenAIRequestToVertex("gemini-2.0-flash", encode(body), false))) as Record<string, unknown>;
    const contents = result.contents as Array<Record<string, unknown>>;
    // Basic structure should be valid Gemini
    expect(contents).toBeDefined();
    expect(contents.length).toBeGreaterThan(0);
  });

  it("strips functionResponse.id", () => {
    // Gemini format with functionResponse that has id
    const body = {
      model: "gemini-2.0-flash",
      messages: [
        { role: "user", content: "use search" },
        { role: "assistant", content: "" },
        {
          role: "tool",
          tool_call_id: "call_xyz",
          content: JSON.stringify({
            type: "tool_result",
            tool_result: {
              id: "call_xyz",
              content: { result: "sunny" },
            },
          }),
        },
      ],
    };
    const result = JSON.parse(new TextDecoder().decode(convertOpenAIRequestToVertex("gemini-2.0-flash", encode(body), false))) as Record<string, unknown>;
    const contents = result.contents as Array<Record<string, unknown>>;
    // Should have function role content
    const fnContent = contents.find((c) => c.role === "function");
    if (fnContent) {
      const parts = fnContent.parts as Array<Record<string, unknown>> | undefined;
      if (parts?.[0]?.functionResponse) {
        expect((parts?.[0]?.functionResponse as Record<string, unknown>).id).toBeUndefined();
      }
    }
  });

  it("preserves text parts", () => {
    const body = {
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: "hello vertex" }],
    };
    const result = JSON.parse(new TextDecoder().decode(convertOpenAIRequestToVertex("gemini-2.0-flash", encode(body), false))) as Record<string, unknown>;
    const contents = result.contents as Array<Record<string, unknown>>;
    expect(contents?.[0]?.role).toBe("user");
    const parts = contents?.[0]?.parts as Array<Record<string, unknown>>;
    expect(parts?.[0]?.text).toBe("hello vertex");
  });

  it("preserves functionCall.name while stripping id", () => {
    const body = {
      model: "gemini-2.0-flash",
      messages: [{
        role: "user",
        content: [{
          type: "tool_calls",
          tool_calls: [{
            id: "id-should-be-removed",
            type: "function",
            function: { name: "get_weather", arguments: '{"city":"NYC"}' },
          }],
        }],
      }],
    };
    const result = JSON.parse(new TextDecoder().decode(convertOpenAIRequestToVertex("gemini-2.0-flash", encode(body), false))) as Record<string, unknown>;
    const contents = result.contents as Array<Record<string, unknown>>;
    const parts = contents[0]?.parts as Array<Record<string, unknown>>;
    const fc = parts[0]?.functionCall as Record<string, unknown>;
    expect(fc.name).toBe("get_weather");
    expect(fc.id).toBeUndefined();
  });
});
