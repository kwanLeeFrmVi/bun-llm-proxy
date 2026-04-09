// Translates Ollama SSE streaming/non-streaming response -> OpenAI Chat Completions format.
// Ollama sends: {"model":"...","done":false,"message":{"role":"assistant","content":"...","thinking":"...","tool_calls":[...]}}

export interface OllamaOpenAIState {
  messageId: string;
  created: number;
  model: string;
  finishReason: string;
  contentAccumulator: string;
  thinkingAccumulator: string;
  hadToolCalls: boolean;
}

function newState(): OllamaOpenAIState {
  return {
    messageId: `chatcmpl-${Date.now()}`,
    created: Math.floor(Date.now() / 1000),
    model: "",
    finishReason: "",
    contentAccumulator: "",
    thinkingAccumulator: "",
    hadToolCalls: false,
  };
}

export function convertOllamaResponseToOpenAI(
  _ctx: unknown,
  _modelName: string,
  _originalRequestRaw: Uint8Array,
  _requestRaw: Uint8Array,
  raw: Uint8Array,
  param: OllamaOpenAIState | undefined
): Uint8Array[] {
  const rawText = new TextDecoder().decode(raw).trim();
  if (!rawText) return [];

  if (rawText === "[DONE]" || rawText === "data: [DONE]") {
    const state = param ?? newState();
    const results: Uint8Array[] = [];
    // Send final chunk with finish_reason
    if (state.finishReason) {
      results.push(new TextEncoder().encode(
        `data: ${JSON.stringify({
          id: state.messageId,
          object: "chat.completion.chunk",
          model: state.model,
          choices: [{ index: 0, delta: {}, finish_reason: state.finishReason }],
        })}\n\n`
      ));
    }
    results.push(new TextEncoder().encode("data: [DONE]\n\n"));
    return results;
  }

  const stripped = rawText.startsWith("data: ")
    ? rawText.slice(6).trim()
    : rawText;

  if (stripped === "[DONE]") {
    const state = param ?? newState();
    const results: Uint8Array[] = [];
    if (state.finishReason) {
      results.push(new TextEncoder().encode(
        `data: ${JSON.stringify({
          id: state.messageId,
          object: "chat.completion.chunk",
          model: state.model,
          choices: [{ index: 0, delta: {}, finish_reason: state.finishReason }],
        })}\n\n`
      ));
    }
    results.push(new TextEncoder().encode("data: [DONE]\n\n"));
    return results;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return [];
  }

  const state = param ?? newState();
  const results: Uint8Array[] = [];

  if (parsed.model) state.model = parsed.model as string;

  // Handle done=true final chunk
  if (parsed.done === true) {
    const doneReason = parsed.done_reason as string | undefined;
    // Determine finish_reason based on done_reason and tool_calls
    let finishReason = "stop";
    if (doneReason === "tool_calls" || state.hadToolCalls) {
      finishReason = "tool_calls";
    } else if (doneReason === "length") {
      finishReason = "length";
    }
    state.finishReason = finishReason;

    // Extract usage
    const usage = extractUsage(parsed);

    results.push(new TextEncoder().encode(
      `data: ${JSON.stringify({
        id: state.messageId,
        object: "chat.completion.chunk",
        created: state.created,
        model: state.model,
        choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
        usage,
      })}\n\n`
    ));
    return results;
  }

  // Content chunk
  const message = parsed.message as Record<string, unknown> | undefined;
  if (!message) return [];

  const content = typeof message.content === "string" ? message.content : "";
  const thinking = typeof message.thinking === "string" ? message.thinking : "";
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : null;

  // Skip empty chunks
  if (!content && !thinking && !toolCalls) return [];

  // Accumulate content in state
  if (content) state.contentAccumulator += content;
  if (thinking) state.thinkingAccumulator += thinking;

  const delta: Record<string, unknown> = {};
  if (content) delta.content = content;
  if (thinking) delta.reasoning_content = thinking;

  // Convert Ollama tool_calls to OpenAI format
  if (toolCalls) {
    state.hadToolCalls = true;
    delta.tool_calls = convertToolCalls(toolCalls);
  }

  results.push(new TextEncoder().encode(
    `data: ${JSON.stringify({
      id: state.messageId,
      object: "chat.completion.chunk",
      created: state.created,
      model: state.model,
      choices: [{ index: 0, delta, finish_reason: null }],
    })}\n\n`
  ));

  return results;
}

export function convertOllamaResponseToOpenAINonStream(
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

  const msg = parsed.message as Record<string, unknown> | undefined ?? {};
  const content = (msg.content as string | undefined) ?? "";
  const thinking = (msg.thinking as string | undefined) ?? "";
  const toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
  const model = (parsed.model as string | undefined) ?? "";

  // Build message object
  const message: Record<string, unknown> = { role: "assistant" };
  if (content) message.content = content;
  if (thinking) message.reasoning_content = thinking;
  if (toolCalls.length > 0) message.tool_calls = convertToolCalls(toolCalls);
  if (!message.content && !message.tool_calls) message.content = "";

  // Determine finish_reason
  let finishReason = (parsed.done_reason as string | undefined) ?? "stop";
  if (toolCalls.length > 0) finishReason = "tool_calls";

  const response: Record<string, unknown> = {
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message,
      finish_reason: finishReason,
    }],
    usage: extractUsage(parsed),
  };

  return new TextEncoder().encode(JSON.stringify(response));
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function extractUsage(ollamaChunk: Record<string, unknown>): Record<string, number> {
  return {
    prompt_tokens: (ollamaChunk.prompt_eval_count as number) ?? 0,
    completion_tokens: (ollamaChunk.eval_count as number) ?? 0,
    total_tokens: ((ollamaChunk.prompt_eval_count as number) ?? 0) + ((ollamaChunk.eval_count as number) ?? 0),
  };
}

function convertToolCalls(toolCalls: unknown[]): unknown[] {
  return toolCalls.map((tc, i) => {
    const tcObj = tc as Record<string, unknown>;
    const fn = tcObj.function as Record<string, unknown> | undefined;
    return {
      index: (fn?.index as number) ?? i,
      id: (tcObj.id as string) ?? `call_${i}_${Date.now()}`,
      type: "function",
      function: {
        name: (fn?.name as string) ?? "",
        arguments: typeof fn?.arguments === "string"
          ? fn.arguments
          : JSON.stringify(fn?.arguments ?? {}),
      },
    };
  });
}
