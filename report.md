# Review: chat handler + streaming pipeline refactor

## 🔴 Bug 1 — Heartbeat stops emitting after the 2nd ping

File: `@/Users/quanle96/Documents/bun-llm-proxy/ai-bridge/utils/streamHeartbeat.ts:15-33`

```@/Users/quanle96/Documents/bun-llm-proxy/ai-bridge/utils/streamHeartbeat.ts:15-33
  const resetTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (controllerRef) {
      timer = setTimeout(() => {
        try {
          controllerRef!.enqueue(PING_BYTES);
        } catch {
          // Controller closed — ignore
        }
        // Re-arm timer for next interval
        timer = setTimeout(() => {
          try { controllerRef!.enqueue(PING_BYTES); } catch { /* closed */ }
        }, intervalMs);
      }, intervalMs);
    }
  };
```

The re-arm inside the outer `setTimeout` only schedules _one_ more one-shot ping — there is no recursion/self-rescheduling. Trace with `intervalMs=15s`:

- `t=0`: [resetTimer()](cci:1://file:///Users/quanle96/Documents/bun-llm-proxy/ai-bridge/utils/streamHeartbeat.ts:14:2-32:4) called from [transform()](cci:1://file:///Users/quanle96/Documents/bun-llm-proxy/ai-bridge/utils/streamHeartbeat.ts:35:4-39:5) → schedule ping at t=15s
- `t=15s`: fire ping → schedule a single nested ping at t=30s
- `t=30s`: fire ping → **no further timer is armed**
- `t≥30s` onward with quiet upstream: no more pings → intermediaries (nginx/Cloudflare) may close idle conn after 60s

The original `wrapStreamingResponse` emitted a ping every 15s indefinitely using `Promise.race` + continuous re-arm. This is a behavioral regression. In current ops it's masked because [chatCore.ts](cci:7://file:///Users/quanle96/Documents/bun-llm-proxy/ai-bridge/handlers/chatCore.ts:0:0-0:0)'s inner heartbeat (`: ping\n\n` every 30s) forwards through this transform and keeps re-arming [transform()](cci:1://file:///Users/quanle96/Documents/bun-llm-proxy/ai-bridge/utils/streamHeartbeat.ts:35:4-39:5), but the outer heartbeat on its own is broken.

**Fix:** call [resetTimer()](cci:1://file:///Users/quanle96/Documents/bun-llm-proxy/ai-bridge/utils/streamHeartbeat.ts:14:2-32:4) recursively (or use a single-shot timer + recursive schedule):

```ts
if (controllerRef) {
  timer = setTimeout(function tick() {
    try {
      controllerRef!.enqueue(PING_BYTES);
    } catch {
      /* closed */
    }
    if (controllerRef) timer = setTimeout(tick, intervalMs);
  }, intervalMs);
}
```

---

## 🟠 Bug 2 — `onUsage` guard removed; latent double-record risk

File: `@/Users/quanle96/Documents/bun-llm-proxy/handlers/chat/usageRecording.ts:3-28`

The original chat.ts callback gated usage persistence:

```ts
onUsage: async (usage) => {
  if (!isStreamingLocal) {
    // saveRequestUsage(...)
  }
};
```

The new factory unconditionally calls `saveRequestUsage` whenever invoked:

```@/Users/quanle96/Documents/bun-llm-proxy/handlers/chat/usageRecording.ts:14-27
  return async (usage: {
    ...
  }) => {
    const durMs = Date.now() - startTime;
    ...
    await saveRequestUsage(requestId, { ..., ttft_ms: durMs, tokens_per_second: tps }, durMs);
  };
```

Today it's still safe because [handleChatCore](cci:1://file:///Users/quanle96/Documents/bun-llm-proxy/ai-bridge/handlers/chatCore.ts:56:0-228:1) only fires `onUsage` on the non-streaming branch (see `@/Users/quanle96/Documents/bun-llm-proxy/ai-bridge/handlers/chatCore.ts:201`). But the streaming wrapper _also_ calls `saveRequestUsage(requestId, …)` once the stream settles (`streamWrapper.ts:131`). If anyone later adds an `onUsage` emission in the streaming path — or if combo routing ever short-circuits before the wrapper runs — you'll double-write usage for the same `requestId`.

**Fix:** re-introduce the streaming guard, or rename the factory to `makeUsageCallback` and pass `isStreaming` so it no-ops when streaming.

---

## 🟠 Bug 3 — `if-aborted` fast-path dropped

File: `@/Users/quanle96/Documents/bun-llm-proxy/handlers/streamWrapper.ts:181-188`

Original wrapper short-circuited when the client signal was already aborted at construction time:

```ts
if (clientSignal?.aborted) {
  safeClose();
  return;
}
```

The v2 wrapper checks `!clientSignal.aborted` before attaching the listener, but if the signal was already aborted when we return the `Response`, the ReadableStream's [pull()](cci:1://file:///Users/quanle96/Documents/bun-llm-proxy/handlers/streamWrapper.ts:151:4-171:5) will still run once, pull a chunk from upstream, and only then surface the disconnect. That's a small waste of an upstream chunk/connection for requests that were canceled before we even returned.

**Fix:** add an early `if (clientSignal?.aborted) { reader.cancel().catch(()=>{}); return /* closed */; }` before `getReader()`, or pre-cancel the reader when building the stream.

---

## 🟡 Nit 1 — Dead / unreachable combo re-check

File: `@/Users/quanle96/Documents/bun-llm-proxy/handlers/chat/singleModelPipeline.ts:33-44`

`runSingleModel` re-runs `routeIfCombo` when `modelInfo.provider` is empty. In the top-level call this is unreachable (combo was just checked in `handleChat`). It's only reachable when `runSingleModel` is invoked by a combo strategy and the selected model happens to itself be a combo alias. The comment says that but it's worth either:

- adding a short guard (e.g. a `skipComboCheck` flag from `handleChat` → `runSingleModel`) to avoid a pointless DB lookup on every non-combo request, or
- inlining the check only into the combo strategy's `handleSingleModel` closure.

Not a correctness bug — purely an extra DB round-trip per request.

---

## 🟡 Nit 2 — `chatCoreOpts` leaks private fields

File: `@/Users/quanle96/Documents/bun-llm-proxy/handlers/chat/requestContextBuilder.ts:90-94`

```ts
// Expose these for the caller
_sourceFormat: sourceFormat,
_isStreamingLocal: isStreamingLocal,
_refreshedCredentials: refreshedCredentials,
```

These fields are passed as part of `chatCoreOpts` to [handleChatCore](cci:1://file:///Users/quanle96/Documents/bun-llm-proxy/ai-bridge/handlers/chatCore.ts:56:0-228:1). They're harmless (the core ignores unknown fields), but it's a leaky abstraction. Prefer returning `{ chatCoreOpts, sourceFormat, isStreamingLocal }` and destructure at the call site. Also, `_refreshedCredentials` is unused by callers.

---

## 🟡 Nit 3 — [parseAndValidateRequest](cci:1://file:///Users/quanle96/Documents/bun-llm-proxy/handlers/chat/bodyParser.ts:24:0-75:1) silently accepts non-string `effort`

File: `@/Users/quanle96/Documents/bun-llm-proxy/handlers/chat/bodyParser.ts:55-58`

```ts
const effort =
  (body.reasoning_effort as string | undefined) ??
  ((body.reasoning as Record<string, unknown> | undefined)?.effort as string | undefined) ??
  null;
```

If `body.reasoning.effort` is a number (e.g. some OpenAI Responses variants pass numeric effort), the `as string` cast is a lie — it will be logged/stored as a non-string. Pre-existing behavior, not a regression, but worth a `typeof` check since you touched it.

---

## 🟡 Nit 4 — Sentinel detection never recovers after a partial match

File: `@/Users/quanle96/Documents/bun-llm-proxy/ai-bridge/utils/streamDiagnostics.ts:63-114`

```@/Users/quanle96/Documents/bun-llm-proxy/ai-bridge/utils/streamDiagnostics.ts:62-71
      // Check for upstream error sentinel (may span chunk boundary)
      const checkText = tailBuffer + text;
      if (checkText.includes(UPSTREAM_ERROR_SENTINEL)) {
        upstreamErrorMsg =
          checkText.split(UPSTREAM_ERROR_SENTINEL)[1]?.split("\n")[0]?.trim() ?? "unknown";
        // Strip the sentinel line from the chunk before forwarding
        const cleaned = text.replace(/: __UPSTREAM_ERROR__:[^\n]*\n?/g, "");
```

Two minor issues:

1. When the sentinel is detected, the `sseBuffer` branch below is skipped for that chunk, so any complete SSE events in the same chunk **won't have their usage extracted**. For a truncation-error chunk this is probably fine, but any usage carried in the _preceding_ bytes of the same chunk is lost.
2. `checkText = tailBuffer + text` is used for detection, but `cleaned = text.replace(...)` strips only from `text`. If the sentinel starts in `tailBuffer` and ends in `text`, `tailBuffer`'s prefix was already forwarded in the previous chunk; the `text.replace` won't remove the trailing portion of the sentinel in `text`. Edge case, but the `[^\n]*` may then not strip the leading `: __UPSTREAM_ERROR__:` because it's gone — actually the regex requires the full `: __UPSTREAM_ERROR__:` literal, so if only a tail fragment is in `text`, the literal match won't trigger → you forward sentinel fragments to the client.

Low priority; the injector in [chatCore.ts](cci:7://file:///Users/quanle96/Documents/bun-llm-proxy/ai-bridge/handlers/chatCore.ts:0:0-0:0) emits the sentinel as a single SSE comment line, which is small enough to rarely split. Still, since the code explicitly comments "may span chunk boundary," it's worth either (a) doing the replace on `checkText` and reconstructing `cleaned` accordingly, or (b) buffering in a small rolling window until `\n\n` is seen.

---

## 🟡 Nit 5 — `controllerRef` not reset on stream error

File: `@/Users/quanle96/Documents/bun-llm-proxy/ai-bridge/utils/streamHeartbeat.ts:42-48`

[flush()](cci:1://file:///Users/quanle96/Documents/bun-llm-proxy/ai-bridge/utils/streamHeartbeat.ts:41:4-47:5) clears the timer and `controllerRef`. But if the writable side errors (instead of closing cleanly), neither [flush](cci:1://file:///Users/quanle96/Documents/bun-llm-proxy/ai-bridge/utils/streamHeartbeat.ts:41:4-47:5) nor [cancel](cci:1://file:///Users/quanle96/Documents/bun-llm-proxy/ai-bridge/handlers/chatCore.ts:843:4-851:5) is spec-guaranteed to run — and there's no [cancel(reason)](cci:1://file:///Users/quanle96/Documents/bun-llm-proxy/ai-bridge/handlers/chatCore.ts:843:4-851:5) handler defined in the transformer. Any in-flight `setTimeout` callback will then try `controllerRef!.enqueue(...)` and rely on the `catch {}` to swallow it. That works today but is fragile; adding a [cancel()](cci:1://file:///Users/quanle96/Documents/bun-llm-proxy/ai-bridge/handlers/chatCore.ts:843:4-851:5) handler that clears the timer would make it robust.

---

# Summary

| #   | Severity        | Location                                                                                                                | Issue                                                                                                                                                                                                                                                          |
| --- | --------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 🔴 Real bug     | `streamHeartbeat.ts:15-33`                                                                                              | Outer heartbeat stops after 2 pings (no recursive re-arm)                                                                                                                                                                                                      |
| 2   | 🟠 Latent       | `usageRecording.ts:14-27`                                                                                               | Dropped `isStreamingLocal` guard — double-write risk if `onUsage` ever fires on streaming                                                                                                                                                                      |
| 3   | 🟠 Regression   | `streamWrapper.ts:181-188`                                                                                              | No pre-aborted fast-path; wastes one upstream read on already-dead clients                                                                                                                                                                                     |
| 4   | 🟡 Perf         | `singleModelPipeline.ts:33-44`                                                                                          | Redundant combo lookup on every non-combo request                                                                                                                                                                                                              |
| 5   | 🟡 Style        | `requestContextBuilder.ts:90-94`                                                                                        | `_sourceFormat` / `_refreshedCredentials` leaked into `chatCoreOpts`                                                                                                                                                                                           |
| 6   | 🟡 Pre-existing | `bodyParser.ts:55-58`                                                                                                   | Unchecked `as string` cast on `effort`                                                                                                                                                                                                                         |
| 7   | 🟡 Edge         | `streamDiagnostics.ts:62-71`                                                                                            | Sentinel strip is on `text`, not `checkText` (cross-chunk fragment could leak)                                                                                                                                                                                 |
| 8   | 🟡 Robustness   | [streamHeartbeat.ts](cci:7://file:///Users/quanle96/Documents/bun-llm-proxy/ai-bridge/utils/streamHeartbeat.ts:0:0-0:0) | No [cancel()](cci:1://file:///Users/quanle96/Documents/bun-llm-proxy/ai-bridge/handlers/chatCore.ts:843:4-851:5) handler; timer cleanup relies on [flush](cci:1://file:///Users/quanle96/Documents/bun-llm-proxy/ai-bridge/utils/streamHeartbeat.ts:41:4-47:5) |
