// SSE (Server-Sent Events) formatting utilities.
// Pure TypeScript — no magic byte manipulation.

/**
 * Build an SSE event payload: `event: <event>\ndata: <payload>\n\n`
 */
export function buildSSEEvent(
  event: string,
  payload: string | object,
  trailingNewlines = 2
): string {
  const data = typeof payload === "string" ? payload : JSON.stringify(payload);
  const newlines = "\n".repeat(trailingNewlines);
  return `event: ${event}\ndata: ${data}${newlines}`;
}

/**
 * Build an SSE data-only event (no named event).
 */
export function buildSSEData(payload: string | object, trailingNewlines = 2): string {
  const data = typeof payload === "string" ? payload : JSON.stringify(payload);
  return `data: ${data}${"\n".repeat(trailingNewlines)}`;
}

/**
 * Append SSE event bytes to a Uint8Array.
 * Returns a new Uint8Array — does not mutate the input.
 */
export function appendSSEEventBytes(
  out: Uint8Array,
  event: string,
  payload: string | object,
  trailingNewlines = 2
): Uint8Array {
  const text = buildSSEEvent(event, payload, trailingNewlines);
  const payloadBytes = new TextEncoder().encode(text);
  const result = new Uint8Array((out?.length ?? 0) + payloadBytes.length);
  if (out?.length) result.set(out);
  result.set(payloadBytes, out?.length ?? 0);
  return result;
}

/**
 * Append SSE data-only bytes to a Uint8Array.
 */
export function appendSSEDataBytes(
  out: Uint8Array,
  payload: string | object,
  trailingNewlines = 2
): Uint8Array {
  const text = buildSSEData(payload, trailingNewlines);
  const payloadBytes = new TextEncoder().encode(text);
  const result = new Uint8Array((out?.length ?? 0) + payloadBytes.length);
  if (out?.length) result.set(out);
  result.set(payloadBytes, out?.length ?? 0);
  return result;
}

/**
 * Build an Anthropic-format `event: error` SSE event.
 * Claude Code recognizes this error type and may trigger its retry mechanism.
 */
export function buildClaudeErrorEvent(errorType: string, message: string): string {
  return buildSSEEvent("error", { type: "error", error: { type: errorType, message } });
}

/**
 * Map an HTTP status code (or null for connection/stall errors) to an Anthropic error type.
 * Used when constructing `event: error` SSE events for Claude clients.
 */
export function mapToAnthropicErrorType(status: number | null, errorMsg?: string): string {
  if (status === 429) return "rate_limit_error";
  if (status !== null && status >= 500) return "overloaded_error";
  if (errorMsg && (errorMsg.includes("stall") || errorMsg.includes("timeout"))) return "overloaded_error";
  return "api_error";
}

/**
 * Format token usage as a SSE data event for Anthropic.
 */
export function formatTokenDataEvent(
  inputTokens: number,
  outputTokens: number,
  cachedTokens = 0
): string {
  const usage: Record<string, unknown> = { input_tokens: inputTokens, output_tokens: outputTokens };
  if (cachedTokens > 0) usage.cache_read_input_tokens = cachedTokens;
  return buildSSEEvent("message_delta", {
    type: "message_delta",
    delta: { stop_reason: null, stop_sequence: null },
    usage,
  });
}
