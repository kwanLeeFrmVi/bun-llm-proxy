// Translates Antigravity streaming response -> OpenAI Chat Completions format.
// Antigravity wraps Gemini-like responses in { response: { ... } }.
// Ported from open-sse/translator/response/openai-to-antigravity.js (inverse)

export interface AntigravityOpenAIState {
  responseId: string;
  modelVersion: string;
  toolCallAccum: Record<number, { id: string; name: string; arguments: string }>;
  toolNameMap: Map<string, string>;
  usage: Record<string, number> | null;
}

function newState(): AntigravityOpenAIState {
  return {
    responseId: `resp_${Date.now()}`,
    modelVersion: "",
    toolCallAccum: {},
    toolNameMap: new Map(),
    usage: null,
  };
}

export function convertAntigravityResponseToOpenAI(
  _ctx: unknown,
  _modelName: string,
  _originalRequestRaw: Uint8Array,
  _requestRaw: Uint8Array,
  raw: Uint8Array,
  param: AntigravityOpenAIState | undefined
): Uint8Array[] {
  const rawText = new TextDecoder().decode(raw).trim();
  if (!rawText) return [];

  if (rawText === "[DONE]" || rawText === "data: [DONE]") {
    return [new TextEncoder().encode("data: [DONE]\n\n")];
  }

  const stripped = rawText.startsWith("data: ") ? rawText.slice(6).trim() : rawText;
  if (stripped === "[DONE]") return [new TextEncoder().encode("data: [DONE]\n\n")];

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return [];
  }

  const state = param ?? newState();
  const results: Uint8Array[] = [];

  // Unwrap Antigravity outer structure: { response: { candidates: [...] } }
  const response = (parsed.response ?? parsed) as Record<string, unknown>;
  const candidates = response.candidates as Array<Record<string, unknown>> | undefined;
  if (!candidates?.[0]) return [];

  const candidate = candidates[0] as Record<string, unknown>;
  const content = candidate.content as Record<string, unknown> | undefined;
  const parts = content?.parts as Array<Record<string, unknown>> | undefined;
  const finishReason = candidate.finishReason as string | undefined;

  if (response.modelVersion) state.modelVersion = response.modelVersion as string;
  if (response.responseId) state.responseId = response.responseId as string;

  const delta: Record<string, unknown> = {};

  if (Array.isArray(parts)) {
    for (const part of parts) {
      // thought: true -> reasoning_content
      if (part.thought === true && part.text) {
        delta.reasoning_content = part.text;
      }
      // Regular text
      else if (part.text !== undefined) {
        delta.content = part.text;
      }
      // functionCall -> accumulate tool calls
      else if (part.functionCall) {
        const fc = part.functionCall as Record<string, unknown>;
        const idx = (fc.id as number) ?? 0;
        if (!state.toolCallAccum[idx]) {
          state.toolCallAccum[idx] = { id: "", name: "", arguments: "" };
        }
        const accum = state.toolCallAccum[idx]!;
        if (fc.id) accum.id = fc.id as string;
        if (fc.name) accum.name = fc.name as string;
        if (fc.args) {
          accum.arguments += typeof fc.args === "string" ? fc.args : JSON.stringify(fc.args);
        }
      }
    }
  }

  // On finish, emit accumulated tool calls
  if (finishReason) {
    const toolCallIndices = Object.keys(state.toolCallAccum).map(Number);
    if (toolCallIndices.length > 0) {
      const toolCalls = toolCallIndices.map((idx) => {
        const accum = state.toolCallAccum[idx]!;
        return {
          index: idx,
          id: accum.id || `call_${idx}_${Date.now()}`,
          type: "function",
          function: { name: accum.name, arguments: accum.arguments },
        };
      });
      delta.tool_calls = toolCalls;
    }
  }

  // Skip empty non-finish chunks
  if (Object.keys(delta).length === 0 && !finishReason) return [];

  // Map finish reason
  const mappedFinish = finishReason ? mapAntigravityFinishReason(finishReason) : null;

  // Build usage
  const usageMeta = response.usageMetadata as Record<string, unknown> | undefined;
  let usage: Record<string, unknown> | undefined;
  if (usageMeta) {
    usage = {
      prompt_tokens: (usageMeta.promptTokenCount as number) ?? 0,
      completion_tokens: (usageMeta.candidatesTokenCount as number) ?? 0,
      total_tokens: (usageMeta.totalTokenCount as number) ?? 0,
    };
  }

  const responseId = response.responseId as string | undefined;
  const modelVersion = response.modelVersion as string | undefined;

  const chunk: Record<string, unknown> = {
    id: responseId ?? state.responseId,
    object: "chat.completion.chunk",
    model: modelVersion ?? state.modelVersion,
    choices: [{ index: 0, delta, finish_reason: mappedFinish }],
  };
  if (usage && mappedFinish) chunk.usage = usage;

  results.push(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
  if (mappedFinish) results.push(new TextEncoder().encode("data: [DONE]\n\n"));

  return results;
}

export function convertAntigravityResponseToOpenAINonStream(
  _ctx: unknown,
  _modelName: string,
  _originalRequestRaw: Uint8Array,
  _requestRaw: Uint8Array,
  raw: Uint8Array
): Uint8Array {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return raw;
  }

  // Unwrap Antigravity structure
  const response = (parsed.response ?? parsed) as Record<string, unknown>;
  const candidates = response.candidates as Array<Record<string, unknown>> | undefined;
  if (!candidates?.[0]) return raw;

  const candidate = candidates[0] as Record<string, unknown>;
  const content = candidate.content as Record<string, unknown> | undefined;
  const parts = content?.parts as Array<Record<string, unknown>> | undefined;
  const finishReason = candidate.finishReason as string | undefined;

  const message: Record<string, unknown> = { role: "assistant" };
  const toolCalls: Array<Record<string, unknown>> = [];
  let textContent = "";

  if (Array.isArray(parts)) {
    for (const part of parts) {
      if (part.text !== undefined) {
        textContent += part.text as string;
      }
      if (part.functionCall) {
        const fc = part.functionCall as Record<string, unknown>;
        toolCalls.push({
          id: (fc.id as string) ?? `call_${Date.now()}`,
          type: "function",
          function: {
            name: fc.name ?? "",
            arguments: typeof fc.args === "string" ? fc.args : JSON.stringify(fc.args ?? {}),
          },
        });
      }
    }
  }

  message.content = textContent || null;
  if (toolCalls.length > 0) message.tool_calls = toolCalls;

  const usageMeta = response.usageMetadata as Record<string, unknown> | undefined;

  return new TextEncoder().encode(JSON.stringify({
    id: response.responseId ?? `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    model: response.modelVersion ?? "",
    choices: [{ index: 0, message, finish_reason: mapAntigravityFinishReason(finishReason ?? "STOP") }],
    usage: {
      prompt_tokens: (usageMeta?.promptTokenCount as number) ?? 0,
      completion_tokens: (usageMeta?.candidatesTokenCount as number) ?? 0,
      total_tokens: (usageMeta?.totalTokenCount as number) ?? 0,
    },
  }));
}

function mapAntigravityFinishReason(reason: string): string {
  switch (reason) {
    case "STOP": return "stop";
    case "MAX_TOKENS": return "length";
    case "SAFETY": return "content_filter";
    default: return "stop";
  }
}
