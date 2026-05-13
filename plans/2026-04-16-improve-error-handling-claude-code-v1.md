# Plan: Improve Error Handling & Client Experience for Claude Code

## Problem Statement

When the proxy's upstream provider fails (e.g., SSL certificate error from trollLLM), Claude Code clients stop mid-message instead of seeing a clean error. The root causes are:

1. **`wrapStreamingResponse` injects an incomplete error event sequence** — it only sends `content_block_delta` but missing `message_delta` (with `usage`) and `message_stop`, so Claude Code waits for completion that never comes.
2. **`readComboError` can't extract error messages from SSE error bodies** — `sseErrorResponse` returns HTTP 200 with error info in SSE events, but `readComboError` only parses JSON, producing a misleading "status 200" log.
3. **No `OUTER_COMPLETE` / final response log** for combo requests that succeed via fallback — making it impossible to confirm the stream actually completed in the logs.
4. **`inner_stream_error` in `wrapStreamingResponse` emits text delta instead of error event** — injecting raw text into a `content_block_delta` is inconsistent; should emit a proper error event before `message_stop`.

---

## Changes

### 1. `wrapStreamingResponse`: emit complete error event sequence

**File:** `handlers/chat.ts`

When the inner stream errors mid-stream (`inner_stream_error`), the response must be a **complete, valid Claude SSE message sequence** so Claude Code processes it correctly. Currently it only injects a text delta — missing the `message_delta` (with usage) and `message_stop` that signal completion.

**Before (lines 591–618):**

```ts
if (!controllerClosed) {
  const errMsgForClient = `Stream error: ${errMsg}`;
  if (sourceFormat === "claude") {
    safeEnqueue(
      new TextEncoder().encode(
        `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: errMsgForClient } })}\n\n`
      )
    );
  }
  // ...
}
safeClose();
```

**After:**

```ts
if (!controllerClosed) {
  const errMsgForClient = `Stream error: ${errMsg}`;
  if (sourceFormat === "claude") {
    // Inject the error message as a text delta (partial content)
    safeEnqueue(
      new TextEncoder().encode(
        `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: errMsgForClient } })}\n\n`
      )
    );
    // Close the content block
    safeEnqueue(
      new TextEncoder().encode(
        `event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`
      )
    );
    // Emit message_delta with usage so Claude Code doesn't crash on missing input_tokens
    safeEnqueue(
      new TextEncoder().encode(
        `event: message_delta\ndata: ${JSON.stringify({
          type: "message_delta",
          delta: { stop_reason: "end_turn", stop_sequence: null },
          usage: { input_tokens: 0, output_tokens: 0 },
        })}\n\n`
      )
    );
    // End the message
    safeEnqueue(
      new TextEncoder().encode(
        `event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`
      )
    );
  } else {
    // OpenAI SSE: emit a final chunk with error finish_reason + [DONE]
    safeEnqueue(
      new TextEncoder().encode(
        `data: ${JSON.stringify({
          id: `chatcmpl_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [
            {
              index: 0,
              delta: { content: errMsgForClient },
              finish_reason: "error",
              logprobs: null,
            },
          ],
        })}\n\n`
      )
    );
    safeEnqueue(new TextEncoder().encode("data: [DONE]\n\n"));
  }
}
safeClose();
```

**Key changes:**

- Claude SSE: injects `content_block_stop` → `message_delta` (with usage) → `message_stop` in addition to the existing `content_block_delta`
- OpenAI SSE: adds explicit `[DONE]` event to close the stream
- In both paths, the downstream is guaranteed a complete, parseable event sequence

---

### 2. `readComboError`: handle SSE error bodies

**File:** `services/comboRouting.ts`

`readComboError` at line 10–28 tries to `JSON.parse` the response body to extract an error message. But `sseErrorResponse` returns HTTP 200 with a multi-event SSE body. The JSON parse fails, and it falls back to `Model X returned status 200` — misleading and useless for debugging.

**Current (lines 10–28):**

```ts
async function readComboError(resp: Response, model: string): Promise<string> {
  try {
    const text = await resp.clone().text();
    if (text) {
      try {
        const json = JSON.parse(text);
        const msg = json?.error?.message ?? json?.error ?? json?.message;
        if (msg && typeof msg === "string") return msg;
      } catch {
        if (text.length <= 300) return text; // returns raw SSE text — garbled
      }
    }
  } catch {
    /* ignore */
  }
  return `Model ${model} returned status ${resp.status}`;
}
```

**After:**

```ts
async function readComboError(resp: Response, model: string): Promise<string> {
  // Check if this is an SSE error response (HTTP 200 with X-Proxy-Error header)
  const proxyErrorStatus = resp.headers.get("X-Proxy-Error");
  if (proxyErrorStatus) {
    // Clone and scan SSE events for the error text in content_block_delta
    try {
      const text = await resp.clone().text();
      const deltaMatch = text.match(/event: content_block_delta\ndata: ({.*?})\n\n/s);
      if (deltaMatch) {
        try {
          const parsed = JSON.parse(deltaMatch[1]!);
          const deltaText = parsed?.delta?.text ?? "";
          // Strip the "[Proxy Error N] " prefix to get the clean message
          const clean = deltaText.replace(/^\[Proxy Error \d+\]\s*/, "");
          if (clean) return clean;
        } catch {
          /* fall through */
        }
      }
      // Fallback: check for OpenAI-style error in SSE data
      const errorMatch = text.match(/data: ({.*?"error".*?})\n\n/s);
      if (errorMatch) {
        try {
          const parsed = JSON.parse(errorMatch[1]!);
          const msg = parsed?.error?.message ?? parsed?.error;
          if (msg && typeof msg === "string") return msg;
        } catch {
          /* fall through */
        }
      }
    } catch {
      /* fall through */
    }
    // Fallback: return "[Proxy Error N] <status>" if we can't extract message
    return `[Proxy Error ${proxyErrorStatus}]`;
  }

  // Standard JSON error body
  try {
    const text = await resp.clone().text();
    if (text) {
      try {
        const json = JSON.parse(text);
        const msg = json?.error?.message ?? json?.error ?? json?.message;
        if (msg && typeof msg === "string") return msg;
      } catch {
        if (text.length <= 300) return text;
      }
    }
  } catch {
    /* ignore */
  }

  return `Model ${model} returned status ${resp.status}`;
}
```

**Key changes:**

- Detects SSE error responses via `X-Proxy-Error` header
- Extracts the error message from `content_block_delta` text (strips `[Proxy Error N]` prefix)
- Falls back gracefully to `[Proxy Error N]` without the garbled SSE text
- Non-SSE responses unchanged

---

### 3. Add final response log after `handleChat` returns

**File:** `routes/v1/messages/index.ts` (and same pattern for `/v1/chat/completions`, `/v1/responses`)

Currently there is no log when a response is returned from `handleChat`. The last log for a successful combo fallback request is the `[COMBO] Weight: ... succeeded` line, but no log confirms the response was actually sent to the client.

**After:**

```ts
export async function POST(req: Request): Promise<Response> {
  const res = await handleChat(req);
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);

  // Log final response status (don't await — fire and forget)
  const url = new URL(req.url);
  log.info(
    null,
    "SEND",
    `${req.method} ${url.pathname} → ${res.status}${res.headers.get("X-Proxy-Error") ? ` (proxy error: ${res.headers.get("X-Proxy-Error")})` : ""}`
  );

  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
```

Also update the other route handlers (`routes/v1/chat/completions/index.ts`, `routes/v1/responses/index.ts`) with the same pattern.

---

### 4. Log TLS/certificate errors with more context

**File:** `handlers/chat.ts` — in `handleSingleModelChat`, when `chatCore` returns a 502 with a certificate/network error, the message is just the raw error string. We should detect TLS-specific errors and produce a more informative log and user-facing message.

**In the transient retry / final error section (around line 398–410):**

Add a helper to classify the error:

```ts
function classifyNetworkError(msg: string): { category: string; suggestion: string } {
  if (msg.includes("unable to verify the first certificate") || msg.includes("certificate")) {
    return {
      category: "TLS_ERROR",
      suggestion:
        "Upstream server has a certificate issue (invalid, expired, or self-signed). Check with the provider.",
    };
  }
  if (msg.includes("ECONNREFUSED")) {
    return { category: "CONNECTION_REFUSED", suggestion: "Server may be down." };
  }
  if (msg.includes("ENOTFOUND") || msg.includes("getaddrinfo")) {
    return { category: "DNS_ERROR", suggestion: "DNS resolution failed." };
  }
  if (msg.includes("ETIMEDOUT") || msg.includes("timed out")) {
    return { category: "TIMEOUT", suggestion: "Connection timed out." };
  }
  return { category: "NETWORK_ERROR", suggestion: "" };
}
```

And in the final error return (lines 434–454), pass the classified error to `sseErrorResponse`:

```ts
const { category } = classifyNetworkError(finalResult.error ?? "");
log.error(ctx, "CHAT", `[${provider}/${model}] ${category}: ${finalResult.error}`);
```

This ensures errors are consistently categorized and the SSE error body carries the clean message.

---

## Testing Plan

### Unit Tests

1. **`readComboError` with SSE error body** (`tests/unit/combo-routing.test.ts`):
   - Mock `Response` with `X-Proxy-Error: 502` header and SSE body containing `[Proxy Error 502] unable to verify the first certificate`
   - Assert the returned message is `"unable to verify the first certificate"` (not `"[Proxy Error 502]"` and not the raw SSE text)

2. **`readComboError` with standard JSON error** (existing path, should remain unchanged):
   - Mock `Response` with `{ "error": { "message": "Rate limited" } }` — assert `"Rate limited"`

3. **`readComboError` with proxy error but unreadable body** (edge case):
   - Mock `Response` with `X-Proxy-Error: 503` and empty body — assert `"[Proxy Error 503]"`

4. **`wrapStreamingResponse` error injection** (`tests/unit/handlers-chat.test.ts`):
   - Mock an inner stream that throws after 2 chunks are read
   - Assert the outer stream emits: `content_block_delta` with error text + `content_block_stop` + `message_delta` with usage + `message_stop` + `[DONE]`
   - Verify total event sequence is a valid Claude SSE message

5. **`classifyNetworkError`** (new unit test):
   - Assert each error category for its respective error string

### Manual Testing

1. Trigger the trollLLM SSL error scenario (with trollLLM account available):
   - Verify log shows `unable to verify the first certificate` (not `status 200`)
   - Verify Claude Code receives a complete SSE error message and exits cleanly

2. Trigger a mid-stream upstream disconnect with a working provider:
   - Verify Claude Code receives the error message inline and exits cleanly (no hanging)

---

## File Summary

| File                                  | Change                                                                                                                           |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `handlers/chat.ts`                    | 1. Complete SSE error sequence in `wrapStreamingResponse` catch block; 2. `classifyNetworkError` helper; 3. Better error logging |
| `services/comboRouting.ts`            | `readComboError` handles SSE error bodies via `X-Proxy-Error` header                                                             |
| `routes/v1/messages/index.ts`         | Add `SEND` log after `handleChat` returns                                                                                        |
| `routes/v1/chat/completions/index.ts` | Same as above                                                                                                                    |
| `routes/v1/responses/index.ts`        | Same as above                                                                                                                    |
| `tests/unit/combo-routing.test.ts`    | New `readComboError` tests                                                                                                       |
| `tests/unit/handlers-chat.test.ts`    | New `wrapStreamingResponse` error injection test                                                                                 |

## Rollout

Changes are additive and backwards-compatible:

- The SSE error sequence is a superset of what was sent before (adds `content_block_stop`, `message_delta`, `message_stop`)
- `readComboError` is only used for logging; no client-facing behavior changes
- `SEND` log is new; no existing behavior changes
- All existing tests pass (verify before and after)
