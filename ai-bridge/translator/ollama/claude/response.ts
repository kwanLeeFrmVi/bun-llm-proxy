// Translates Ollama SSE streaming → Anthropic SSE format
// Ollama sends: data: {"model":"...","done":false,"message":{"role":"assistant","content":"..."}}
// Tool call chunks: data: {"model":"...","message":{"tool_calls":[{"function":{"name":"bash","arguments":"{\"cmd\":\"ls\"}"}}]}}

export interface OllamaStreamingState {
  messageId: string;
  model: string;
  textBlockStarted: boolean;
  textBlockIndex: number;
  nextBlockIndex: number;
  messageStarted: boolean;
  messageStopSent: boolean;
  contentAccumulator: string;
  // Tool call support
  toolBlockIndex: number;
  nextToolIndex: number;
  // Track open tool block indices that need content_block_stop
  openToolBlocks: number[];
}

export function newState(): OllamaStreamingState {
  return {
    messageId: `ollama-${Date.now()}`,
    model: "",
    textBlockStarted: false,
    textBlockIndex: -1,
    nextBlockIndex: 0,
    messageStarted: false,
    messageStopSent: false,
    contentAccumulator: "",
    toolBlockIndex: -1,
    nextToolIndex: 0,
    openToolBlocks: [],
  };
}

export function convertOllamaResponseToClaude(
  _ctx: unknown,
  _modelName: string,
  _originalRequestRaw: Uint8Array,
  _requestRaw: Uint8Array,
  raw: Uint8Array,
  param: OllamaStreamingState | undefined
): Uint8Array[] {
  const rawText = new TextDecoder().decode(raw).trim();
  if (!rawText) return [];

  if (rawText === "[DONE]" || rawText === "data: [DONE]") {
    return buildDoneEvents(param ?? newState());
  }

  const stripped = rawText.startsWith("data: ") ? rawText.slice(6).trim() : rawText;

  if (stripped === "[DONE]") {
    return buildDoneEvents(param ?? newState());
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

  // message_start
  if (!state.messageStarted) {
    state.messageStarted = true;
    results.push(
      buildSSEEvent("message_start", {
        type: "message_start",
        message: {
          id: state.messageId,
          type: "message",
          role: "assistant",
          model: state.model,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        },
      })
    );
  }

  const message = parsed.message as Record<string, unknown> | undefined;

  // ── Handle tool_calls ──────────────────────────────────────────────────────────
  const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : null;
  if (toolCalls) {
    for (const tc of toolCalls) {
      const tcObj = tc as Record<string, unknown>;
      const fn = tcObj.function as Record<string, unknown> | undefined;
      const toolName = (fn?.name as string) ?? "";
      const rawArgs =
        typeof fn?.arguments === "string" ? fn.arguments : JSON.stringify(fn?.arguments ?? {});

      state.toolBlockIndex = state.nextBlockIndex++;
      state.nextToolIndex++;
      const toolId = `toolu_${state.toolBlockIndex}_${state.messageId}`;

      // content_block_start: tool_use
      results.push(
        buildSSEEvent("content_block_start", {
          type: "content_block_start",
          index: state.toolBlockIndex,
          content_block: { type: "tool_use", id: toolId, name: toolName, input: "" },
        })
      );

      // content_block_delta: input_json_delta
      results.push(
        buildSSEEvent("content_block_delta", {
          type: "content_block_delta",
          index: state.toolBlockIndex,
          delta: { type: "input_json_delta", partial_json: rawArgs },
        })
      );

      // content_block_stop: close the tool block immediately since Ollama
      // sends complete tool call arguments in a single chunk (non-incremental).
      results.push(
        buildSSEEvent("content_block_stop", {
          type: "content_block_stop",
          index: state.toolBlockIndex,
        })
      );
    }
  }

  // ── Handle text content ───────────────────────────────────────────────────────
  if (message) {
    const content = message.content as string | undefined;
    if (content) {
      // Start text block if not started
      if (!state.textBlockStarted) {
        state.textBlockIndex = state.nextBlockIndex++;
        state.textBlockStarted = true;
        results.push(
          buildSSEEvent("content_block_start", {
            type: "content_block_start",
            index: state.textBlockIndex,
            content_block: { type: "text", text: "" },
          })
        );
      }

      results.push(
        buildSSEEvent("content_block_delta", {
          type: "content_block_delta",
          index: state.textBlockIndex,
          delta: { type: "text_delta", text: content },
        })
      );
      state.contentAccumulator += content;
    }
  }

  // done
  if (parsed.done === true) {
    // Extract real usage from Ollama's eval_count / prompt_eval_count
    const outputTokens = (parsed.eval_count as number) ?? 0;
    const inputTokens = (parsed.prompt_eval_count as number) ?? 0;

    const doneReason = parsed.done_reason as string | undefined;
    let stopReason = "end_turn";
    if (doneReason === "length") {
      stopReason = "max_tokens";
    } else if (doneReason === "tool_calls") {
      stopReason = "tool_use";
    }

    // Close text block if started
    if (state.textBlockStarted) {
      results.push(
        buildSSEEvent("content_block_stop", {
          type: "content_block_stop",
          index: state.textBlockIndex,
        })
      );
      state.textBlockStarted = false;
    }

    results.push(
      buildSSEEvent("message_delta", {
        type: "message_delta",
        delta: { stop_reason: stopReason, stop_sequence: null },
        usage: { input_tokens: inputTokens, output_tokens: outputTokens },
      })
    );

    results.push(buildSSEEvent("message_stop", { type: "message_stop" }));
    state.messageStopSent = true;
  }

  return results;
}

export function convertOllamaResponseToClaudeNonStream(
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

  const message = parsed.message as Record<string, unknown> | undefined;
  const textContent = (message?.content as string | undefined) ?? "";

  // Build content array (text + tool_use blocks)
  const content: Record<string, unknown>[] = [];

  // Text block
  if (textContent) {
    content.push({ type: "text", text: textContent });
  }

  // Tool calls
  const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : null;
  if (toolCalls) {
    for (let i = 0; i < toolCalls.length; i++) {
      const tc = toolCalls[i] as Record<string, unknown>;
      const fn = tc.function as Record<string, unknown> | undefined;
      const toolName = (fn?.name as string) ?? "";
      const rawArgs =
        typeof fn?.arguments === "string" ? fn.arguments : JSON.stringify(fn?.arguments ?? {});
      content.push({
        type: "tool_use",
        id: `toolu_${i}_${Date.now()}`,
        name: toolName,
        input: rawArgs,
      });
    }
  }

  const model = (parsed.model as string | undefined) ?? "";
  const doneReason = parsed.done_reason as string | undefined;
  let stopReason = "end_turn";
  if (doneReason === "length") {
    stopReason = "max_tokens";
  } else if (doneReason === "tool_calls" || content.some((c) => c.type === "tool_use")) {
    stopReason = "tool_use";
  }

  const outputTokens = (parsed.eval_count as number) ?? 0;
  const inputTokens = (parsed.prompt_eval_count as number) ?? 0;

  // If no content at all, send a minimal text block
  if (content.length === 0) {
    content.push({ type: "text", text: "" });
  }

  return new TextEncoder().encode(
    JSON.stringify({
      id: `ollama-${Date.now()}`,
      type: "message",
      role: "assistant",
      model,
      content,
      stop_reason: stopReason,
      stop_sequence: null,
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    })
  );
}

function buildSSEEvent(event: string, payload: object): Uint8Array {
  const text = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  return new TextEncoder().encode(text);
}

function buildDoneEvents(state: OllamaStreamingState): Uint8Array[] {
  const results: Uint8Array[] = [];
  if (state.textBlockStarted) {
    results.push(
      buildSSEEvent("content_block_stop", {
        type: "content_block_stop",
        index: state.textBlockIndex,
      })
    );
  }
  // Close any tool blocks that weren't closed inline
  for (const toolBlockIdx of state.openToolBlocks) {
    results.push(
      buildSSEEvent("content_block_stop", {
        type: "content_block_stop",
        index: toolBlockIdx,
      })
    );
  }
  if (!state.messageStopSent) {
    // Determine stop_reason based on whether tool calls were present
    const stopReason = state.nextToolIndex > 0 ? "tool_use" : "end_turn";
    results.push(
      buildSSEEvent("message_delta", {
        type: "message_delta",
        delta: { stop_reason: stopReason, stop_sequence: null },
        usage: { input_tokens: 0, output_tokens: 0 },
      })
    );
    results.push(buildSSEEvent("message_stop", { type: "message_stop" }));
  }
  return results;
}
