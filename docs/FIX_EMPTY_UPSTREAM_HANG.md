# Fix: Claude Code Stream Hang on Client Disconnect

**Date:** 2026-04-19
**Symptom:** Client reports Claude Code stream stops mid-response and hangs with no error.

## Root Cause (Issue 1): Empty Upstream Response

When upstream providers (e.g. `pro-x.io.vn`) return HTTP 200 with a stream body that contains **no actual content** (0 tokens, no `message_start` event from upstream), the proxy treated this as a successful response. It injected synthetic `message_start`, `message_delta`, and `message_stop` events, then reported `OUTER_COMPLETE` with 0 tokens.

Claude Code received a "complete" but empty response and hung because there was no actual content to process.

### Log Signature of Empty Upstream Bug

```
[STREAM] INNER complete: 1 upstreamChunks, 4 translatedChunks, 0 events,
  sawMessageStart=false, sawMessageStop=false, sawValidMessageDelta=false,
  closeReason=normal, totalMs=3

[STREAM] OUTER_COMPLETE {"usage":{"prompt_tokens":0,"completion_tokens":0,...},
  "closeReason":"normal","downstreamChunkCount":4,...}
```

Key indicators:

- `1 upstreamChunks` — upstream sent essentially nothing
- `sawMessageStart=false` — no real Claude message was ever started
- `prompt_tokens: 0, completion_tokens: 0` — zero content
- `closeReason=normal` — incorrectly treated as success

## Root Cause (Issue 2): Inner Stream Not Canceling on Client Disconnect

When the client (Claude Code) disconnects mid-stream, the outer wrapper's `cancel()` fires and propagates to the inner stream's `cancel()` callback. The callback sets `streamAbort.abort()` and `downstreamCanceled = true`. However, the inner stream's `start()` read loop was stuck in:

```js
await Promise.race([readPromise, heartbeatPromise, stallPromise]);
```

`streamAbort.abort()` only sets a flag checked at the **top** of the while-loop. If the loop was currently awaiting the `Promise.race`, it wouldn't wake up until:

1. The heartbeat timer fired (15 seconds later)
2. The upstream sent more data
3. The stall timer fired (5 minutes later)

This caused a **6-15 second delay** between the client disconnecting and the inner stream actually stopping. During this time, the inner stream kept reading upstream chunks and trying to enqueue them into the already-closed controller, producing `safeEnqueue: controller.enqueue failed (downstream closed): Invalid state: Controller is already closed` errors.

### Log Signature of Disconnect Delay Bug

```
[19:25:44] OUTER_CANCELED {"error":"client signal aborted","closeReason":"downstream_canceled",...}
[19:25:50] safeEnqueue: controller.enqueue failed (downstream closed): Invalid state: Controller is already closed
[19:25:50] INNER complete: 5 upstreamChunks, 6 translatedChunks, ... sawMessageStop=false,
  sawValidMessageDelta=false, closeReason=normal, totalMs=15409
```

Key indicators:

- 6-second gap between `OUTER_CANCELED` and `INNER complete`
- `closeReason=normal` even though client disconnected (misleading)
- `safeEnqueue` failures after downstream closed
- `sawMessageStop=false` — upstream never completed the message

## Changes

### 1. Inner Stream: Empty Upstream Detection (`ai-bridge/handlers/chatCore.ts`)

Added detection in the normal completion path (after upstream finishes). When the upstream returned a 200 stream with no real content:

**Detection criteria** (all must be true):

- `sourceFormat === "claude"`
- `sawMessageStart === false` (upstream never sent `message_start`)
- `sawMessageStop === false` (upstream never sent `message_stop`)
- `chunkCount <= 2` (very few raw TCP chunks from upstream)

**What happens on detection:**

1. Emits `__UPSTREAM_ERROR__` sentinel so the outer wrapper logs `OUTER_ERROR` instead of `OUTER_COMPLETE`
2. Emits a Claude `error` event (`type: "api_error"`) so Claude Code can trigger its retry mechanism
3. Still emits minimal termination sequence (`message_start` + `message_delta` + `message_stop`) so the client doesn't hang waiting for SSE events
4. Sets `closeReason = "upstream_error"` for correct log classification

**New log signature:**

```
[STREAM] EMPTY_UPSTREAM: upstream returned 200 with empty stream
  (chunks=1, sawMessageStart=false, sawMessageStop=false, provider=...).
  Injecting error event instead of synthetic termination.

[STREAM] INNER complete: ... closeReason=upstream_error, ...

[STREAM] OUTER_ERROR {"error":"Upstream stream truncated: Empty upstream response (0 tokens)",
  "closeReason":"upstream_error",...}
```

### 2. Inner Stream: Abort-Aware Promise Race (`ai-bridge/handlers/chatCore.ts`)

Added an `abortPromise` to the `Promise.race` in the inner stream's read loop:

```js
const abortPromise = new Promise((resolve) => {
  streamAbort.signal.addEventListener("abort", () =>
    resolve({ kind: "abort", ... }), { once: true });
});

const result = await Promise.race([
  readPromise.then(...),
  heartbeatPromise.then(...),
  stallPromise.then(...),
  abortPromise,  // NEW: resolves immediately on streamAbort.abort()
]);
```

When the client disconnects → outer `cancel()` → inner `cancel()` → `streamAbort.abort()`, the `abortPromise` resolves **immediately**, breaking the read loop without waiting for the heartbeat timer (15s) or upstream data.

### 3. Inner Stream: Fast-Path Downstream Cancellation (`ai-bridge/handlers/chatCore.ts`)

Added a check at the start of the normal completion path: if `downstreamCanceled` is true (client already disconnected), skip all termination event injection and close immediately. The outer wrapper already logged `OUTER_CANCELED`; injecting events into a closed controller is pointless and just produces "Controller is already closed" errors.

**New log signature:**

```
INNER complete: 5 upstreamChunks, 6 translatedChunks, ... closeReason=downstream_canceled, totalMs=...
```

Instead of the misleading `closeReason=normal`.

### 4. Outer Wrapper: Empty Response Logging (`handlers/streamWrapper.ts`)

Added outer-layer detection for empty responses that slip through. When the stream completes "normally" but the diagnostics show 0 tokens and very few chunks:

**Detection criteria:**

- `finalUsage` exists
- `completion_tokens === 0` AND `prompt_tokens === 0`
- `downstreamChunkCount <= 5`

Logs `OUTER_ERROR` instead of `OUTER_COMPLETE` so these incidents are easy to find in log searches.

## Why Claude Code Hangs

1. **Empty response (Issue 1):** Claude Code's SSE parser expects a valid Claude response with actual content. When it receives a synthetic-only response (no real `message_start` from upstream, no content blocks, no text), it enters a waiting state expecting more data that never comes. The fix ensures Claude Code receives a proper `error` event that its retry mechanism recognizes.

2. **Slow cleanup on disconnect (Issue 2):** When the upstream stalls mid-stream, Claude Code waits for data. After its internal timeout (~5-10s of no data), it disconnects. But the proxy's inner stream kept running for up to 15 more seconds, wasting resources. The fix ensures the inner stream stops within milliseconds of the client disconnect.

3. **Heartbeat too slow (Issue 3):** The proxy sent SSE comment pings (`: ping\n\n`) every 15 seconds. When the upstream stalled, Claude Code would abort after ~5-10 seconds of inactivity — before the heartbeat could fire. Reducing the heartbeat to 5 seconds ensures Claude Code stays alive during upstream stalls.

## Related

- Slow upstream (trollLLM) causing client timeout after ~10s (`OUTER_CANCELED`). The 5s heartbeat pings now keep Claude Code alive during upstream stalls, but cannot help if the upstream never sends data at all (stall timeout remains 5min).
