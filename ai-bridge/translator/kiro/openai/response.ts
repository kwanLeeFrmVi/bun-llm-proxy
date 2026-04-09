// Translates Kiro/AWS CodeWhisperer SSE events → OpenAI Chat Completions format.
// Ported from open-sse/translator/response/kiro-to-openai.js

export interface KiroOpenAIState {
  responseId: string;
  created: number;
  model: string;
  chunkIndex: number;
  finishReason: string;
  usage: Record<string, number> | null;
}

function newState(): KiroOpenAIState {
  return {
    responseId: `chatcmpl-${Date.now()}`,
    created: Math.floor(Date.now() / 1000),
    model: "kiro",
    chunkIndex: 0,
    finishReason: "",
    usage: null,
  };
}

export function convertKiroResponseToOpenAI(
  _ctx: unknown,
  _modelName: string,
  _originalRequestRaw: Uint8Array,
  _requestRaw: Uint8Array,
  raw: Uint8Array,
  param: KiroOpenAIState | undefined
): Uint8Array[] {
  const rawText = new TextDecoder().decode(raw).trim();
  if (!rawText) return [];

  if (rawText === "[DONE]" || rawText === "data: [DONE]") {
    return [new TextEncoder().encode("data: [DONE]\n\n")];
  }

  const state = param ?? newState();

  // Parse SSE: event:xxx / :event-type:xxx / data:xxx
  const lines = rawText.split("\n");
  let eventType = "";
  let eventData = "";

  for (const line of lines) {
    if (line.startsWith("event:")) {
      eventType = line.slice(6).trim();
    } else if (line.startsWith(":event-type:")) {
      eventType = line.slice(12).trim();
    } else if (line.startsWith("data:")) {
      eventData = line.slice(5).trim();
    } else if (line.trim() && !line.startsWith(":")) {
      eventData = line.trim();
    }
  }

  if (!eventData) return [];

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(eventData) as Record<string, unknown>;
    data._eventType = eventType;
  } catch {
    data = { text: eventData, _eventType: eventType };
  }

  // If already in OpenAI format
  if (data.object === "chat.completion.chunk" && data.choices) {
    // rawText may already include "data: " prefix — don't re-wrap in that case
    const alreadyPrefixed = rawText.startsWith("data: ");
    if (alreadyPrefixed) {
      return [new TextEncoder().encode(`${rawText}\n`)];
    }
    return [
      new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`),
    ];
  }

  const et = (data._eventType as string) || (data.event as string) || "";

  const makeChunk = (delta: Record<string, unknown>, finishReason: string | null = null) => ({
    id: state.responseId,
    object: "chat.completion.chunk",
    created: state.created,
    model: state.model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  });

  // assistantResponseEvent → content delta
  if (et === "assistantResponseEvent" || data.assistantResponseEvent) {
    const inner = (data.assistantResponseEvent as Record<string, unknown>) ?? data;
    const content = (inner.content as string) || "";
    if (!content) return [];
    const delta: Record<string, unknown> = {
      ...(state.chunkIndex === 0 ? { role: "assistant" } : {}),
      content,
    };
    state.chunkIndex++;
    return [new TextEncoder().encode(`data: ${JSON.stringify(makeChunk(delta))}\n\n`)];
  }

  // reasoningContentEvent → thinking
  if (et === "reasoningContentEvent" || data.reasoningContentEvent) {
    const inner = (data.reasoningContentEvent as Record<string, unknown>) ?? data;
    const content = (inner.content as string) || "";
    if (!content) return [];
    const delta: Record<string, unknown> = {
      ...(state.chunkIndex === 0 ? { role: "assistant" } : {}),
      content: `<thinking>${content}</thinking>`,
    };
    state.chunkIndex++;
    return [new TextEncoder().encode(`data: ${JSON.stringify(makeChunk(delta))}\n\n`)];
  }

  // toolUseEvent → tool_calls
  if (et === "toolUseEvent" || data.toolUseEvent) {
    const toolUse = (data.toolUseEvent as Record<string, unknown>) ?? data;
    const toolCallId = (toolUse.toolUseId as string) ?? `call_${Date.now()}`;
    const toolName = (toolUse.name as string) ?? "";
    const toolInput = (toolUse.input as Record<string, unknown>) ?? {};
    const delta: Record<string, unknown> = {
      ...(state.chunkIndex === 0 ? { role: "assistant" } : {}),
      tool_calls: [{
        index: 0,
        id: toolCallId,
        type: "function",
        function: { name: toolName, arguments: JSON.stringify(toolInput) },
      }],
    };
    state.chunkIndex++;
    return [new TextEncoder().encode(`data: ${JSON.stringify(makeChunk(delta))}\n\n`)];
  }

  // usageEvent → store usage for final chunk
  if (et === "usageEvent" || data.usageEvent) {
    const usage = (data.usageEvent as Record<string, unknown>) ?? data;
    state.usage = {
      prompt_tokens: (usage.inputTokens as number) || 0,
      completion_tokens: (usage.outputTokens as number) || 0,
      total_tokens: ((usage.inputTokens as number) || 0) + ((usage.outputTokens as number) || 0),
    };
    return [];
  }

  // messageStopEvent / done → finish chunk + [DONE]
  if (et === "messageStopEvent" || et === "done" || data.messageStopEvent) {
    state.finishReason = "stop";
    const finalChunk: Record<string, unknown> = {
      ...makeChunk({}, "stop"),
    };
    if (state.usage) {
      (finalChunk as Record<string, unknown>).usage = state.usage;
    }
    return [
      new TextEncoder().encode(`data: ${JSON.stringify(finalChunk)}\n\n`),
      new TextEncoder().encode("data: [DONE]\n\n"),
    ];
  }

  return [];
}

export function convertKiroResponseToOpenAINonStream(
  _ctx: unknown,
  _modelName: string,
  _originalRequestRaw: Uint8Array,
  _requestRaw: Uint8Array,
  raw: Uint8Array
): Uint8Array {
  // Kiro is streaming-only; try best-effort parse
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return raw;
  }

  // Already OpenAI format
  if (parsed.choices) return raw;

  const content = (parsed.content as string) ?? "";
  return new TextEncoder().encode(JSON.stringify({
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: "kiro",
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  }));
}
