# Plan: Fix SSE Format Mismatch on OpenAI Endpoints with Claude Models

## Context

**Error:** When a client uses the **OpenAI-compatible endpoint** (`/v1/chat/completions`) with a **Claude model** (e.g., `claude-3-5-sonnet`, or any `anthropic-compatible-*` provider), the proxy correctly translates the request from OpenAI→Claude and the response from Claude→OpenAI. However, **error responses mid-stream are always emitted as Claude SSE format** regardless of the client's endpoint.

The client (OpenAI client library, e.g., `reqwest`/HTTP2) sees Claude-format SSE events (`message_start`, `content_block_delta`, etc.) when it expects OpenAI-format (`data: {id, choices, ...}`) — causing the error:

```
error decoding response body
stream error received: unexpected internal error encountered
```

**Root cause chain:**
1. `handlers/chat.ts` line 342: `onStreamError: (status, msg) => sseErrorResponse(status, msg)` — always uses Claude SSE format
2. `chatCore.ts` calls `opts.onStreamError` when the upstream returns an error HTTP status during streaming
3. `wrapStreamingResponse` in `handlers/chat.ts` (line 576–582) emits `data: {error: {...}}` (raw JSON, not valid SSE at all)
4. `wrapStreamingResponse` in `handlers/chat.ts` (line 429–433) uses `sseErrorResponse` even for non-Claude source formats
5. `sseErrorResponse` in `ai-bridge/utils/error.ts` always emits Claude SSE events

**Key files involved:**
- `ai-bridge/utils/error.ts` — `sseErrorResponse` only emits Claude SSE
- `ai-bridge/handlers/chatCore.ts` — calls `opts.onStreamError` for upstream HTTP errors
- `handlers/chat.ts` — `onStreamError` is hardcoded to `sseErrorResponse`; `wrapStreamingResponse` has mixed SSE issues

## Fix

### Step 1 — Add `openaiSseErrorResponse` to `ai-bridge/utils/error.ts`

Create a new function that emits an OpenAI SSE-compatible error stream:

```typescript
/**
 * Return an error as an OpenAI SSE stream.
 * Clients on /v1/chat/completions expect: data: {id, object, choices: [{finish_reason, ...}], ...}\n\n
 * Not: event: message_start\ndata: {...}
 */
export function openaiSseErrorResponse(status: number, message: string): Response {
  const id = `chatcmpl_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const errorChunk = JSON.stringify({
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: "",
    choices: [{
      index: 0,
      delta: {},
      finish_reason: "error",
      logprobs: null,
    }],
  });
  const errorData = JSON.stringify({
    error: {
      message,
      type: "proxy_error",
      code: String(status),
    },
  });

  const body =
    `data: ${errorChunk}\n\n` +
    `data: [DONE]\n\n`;

  return new Response(body, {
    status: 200, // OpenAI SSE errors are 200 with error in chunk body
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
```

### Step 2 — Add `openaiSseErrorResponse` to `ai-bridge/index.ts` exports

Ensure the function is re-exported from the ai-bridge index.

### Step 3 — Fix `handlers/chat.ts` — `onStreamError` and error path

**Change `onStreamError` to be format-aware:**

```typescript
// Replace the static:
onStreamError: (status: number, msg: string) => sseErrorResponse(status, msg),

// With a format-aware version using the sourceFormat already computed:
onStreamError: (status: number, msg: string) =>
  sourceFormat === "claude"
    ? sseErrorResponse(status, msg)
    : openaiSseErrorResponse(status, msg),
```

**Fix `wrapStreamingResponse` error path (lines 429–433):**

Currently:
```typescript
if (isStreaming && isClaudeStreamingClient(body, request)) {
  return sseErrorResponse(...)
```

Should use the same `sourceFormat` check (which is already available in scope) instead of `isClaudeStreamingClient`.

**Fix `wrapStreamingResponse` inner error chunk (lines 576–582):**

The raw JSON injection `safeEnqueue(new TextEncoder().encode(`data: ${errorPayload}\n\n`))` is not valid SSE for either format. For OpenAI clients, this should be omitted or properly formatted as an OpenAI SSE chunk.

### Step 4 — Verify no other callers of `sseErrorResponse` need changing

Check all call sites of `sseErrorResponse` in `handlers/chat.ts` — all other callers already use `isClaudeStreamingClient` to guard, which correctly detects whether the client is expecting Claude format (via `/v1/messages` endpoint or body detection). Only the `onStreamError` callback was unconditional.

## Files to Modify

| File | Change |
|------|--------|
| `ai-bridge/utils/error.ts` | Add `openaiSseErrorResponse()` function |
| `handlers/chat.ts` | Fix `onStreamError` to branch on `sourceFormat`; fix `wrapStreamingResponse` error paths |

## Verification

1. **Unit test:** Send a streaming request to `/v1/chat/completions` with `anthropic-compatible-*` provider where the upstream returns an error — verify the response is OpenAI SSE format, not Claude SSE.
2. **Unit test:** Send the same error scenario to `/v1/messages` (Claude endpoint) — verify Claude SSE format is still correct.
3. **Integration:** Run `bun test` to ensure no regressions in streaming tests.
4. **Manual:** Point an OpenAI client at the proxy with an `anthropic-compatible-*` node and trigger an error (e.g., invalid API key) — verify the client sees a proper OpenAI error, not a decode failure.
