# Refactor Streaming Pipeline (v2 side-by-side strategy)

## Objective

Build the new pipeline-based streaming wrapper as `*.v2.ts` files alongside the originals, then swap import sites. Keeps the original code intact for instant rollback and side-by-side diffing during validation.

## Context

- `handlers/chat.ts:522-876` — current `wrapStreamingResponse` to be re-implemented in v2.
- `handlers/chat.ts:422-431` — sole call site of `wrapStreamingResponse` (inside `handlers/chat.ts` itself).
- `handlers/chat.ts:870-875` + `WRAPPED_STREAM_MARKER` (`handlers/chat.ts:8`) — final `Response` construction + double-wrap guard.
- `ai-bridge/handlers/chatCore.ts:44-55,57,257-869,812-813,855-868` — inner stream contract.
- `ai-bridge/utils/ollamaTransform.ts:16-115,124` — only existing `TransformStream`/`pipeThrough` precedent.
- `lib/logger.ts:235-269` — `log.stream(ctx, event, data)` overload.
- `stubs/usageDb.ts` — `saveRequestUsage` is async and safely `.catch()`-able.
- 9router reference: `open-sse/utils/streamHandler.js:16-83,89-123,131-137`.

## Log Payload Field Set (Preserve Exactly)

| Field                    | Type                                                                            | Events                               |
| ------------------------ | ------------------------------------------------------------------------------- | ------------------------------------ |
| `provider`               | `string`                                                                        | All                                  |
| `model`                  | `string`                                                                        | All                                  |
| `usage`                  | `{ prompt_tokens?, completion_tokens?, reasoning_tokens?, cached_tokens? }`     | `OUTER_COMPLETE` only                |
| `closeReason`            | `"normal" \| "downstream_canceled" \| "inner_stream_error" \| "upstream_error"` | All                                  |
| `downstreamChunkCount`   | `number`                                                                        | All                                  |
| `firstDownstreamChunkMs` | `number \| null`                                                                | All                                  |
| `durationMs`             | `number`                                                                        | All                                  |
| `error`                  | `string`                                                                        | `OUTER_ERROR`, `OUTER_CANCELED` only |

## Implementation Plan

- [ ] Task 1. Create `ai-bridge/utils/streamDiagnostics.v2.ts` — diagnostic TransformStream
- [ ] Task 2. Create `ai-bridge/utils/streamHeartbeat.v2.ts` — heartbeat TransformStream
- [ ] Task 3. Create `handlers/streamWrapper.v2.ts` — pipeline composition + onSettled
- [ ] Task 4. Add feature flag at call site in `handlers/chat.ts`
- [ ] Task 5. Add `unhandledRejection`/`uncaughtException` handlers in `index.ts`
- [ ] Task 6. Verify `tsc --noEmit` passes
- [ ] Task 7. Smoke test (manual, user sign-off required)
- [ ] Task 8. Promotion: delete v1, remove feature flag (after sign-off only)

## Verification Criteria

- Original crash scenario (long stream + abrupt disconnect) does not restart Bun.
- Log field names/values identical between v1 and v2.
- `tsc --noEmit` passes (only pre-existing `lib/redis.ts:166` error).
- `saveRequestUsage` called exactly once per request.
- `WRAPPED_STREAM_MARKER` guard still works.
- Heartbeat ping after 15s upstream silence.
- v2 source under 200 lines combined.
