# Refactor: handlers/chat.ts — Comprehensive Decomposition

## Goal

Reduce `handlers/chat.ts` from ~891 lines to <150 lines by extracting pure utilities, combo routing, credential resolution, and retry logic into focused modules under `handlers/chat/`.

## Pre-existing baseline

- `npx tsc --noEmit` shows only `lib/redis.ts:166` error.

---

## Phase A — Promote v2 streaming

### A1: Remove feature flag & delete old wrapper

- Change ternary `(process.env.USE_V2_STREAM_WRAPPER === "true" ? wrapStreamingResponseV2 : wrapStreamingResponse)(...)` → `wrapStreamingResponseV2(...)`.
- Delete entire `wrapStreamingResponse` function body (lines 525-879).
- Keep `WRAPPED_STREAM_MARKER` Symbol and `isAlreadyWrappedStream`.

### A2: Rename v2 files to canonical names

- `handlers/streamWrapper.v2.ts` → `handlers/streamWrapper.ts`
- `ai-bridge/utils/streamDiagnostics.v2.ts` → `ai-bridge/utils/streamDiagnostics.ts`
- `ai-bridge/utils/streamHeartbeat.v2.ts` → `ai-bridge/utils/streamHeartbeat.ts`
- Update ALL imports referencing old filenames.

---

## Phase B — Extract pure utilities

### B1: Extract classifyNetworkError

- Move to `handlers/chat/networkErrorClassify.ts`.

### B2: Create format-aware error response helper

- Create `handlers/chat/errorShaping.ts` with `formatAwareErrorResponse`.
- Replace 6 duplicated blocks in chat.ts.

### B3: Extract body parser

- Create `handlers/chat/bodyParser.ts` with `parseAndValidateRequest`.
- Returns `{ ok: true, body, modelStr, ... }` or `{ ok: false, response }`.

---

## Phase C — Extract combo routing

### C1: Create combo router

- Create `handlers/chat/comboRouter.ts` with `routeIfCombo(opts)`.

### C2: Move handleComboModelWithDB

- Move into `handlers/chat/comboRouter.ts`.

### C3: Update handleChat and single-model pipeline

- Replace inline combo blocks with `routeIfCombo` calls.

---

## Phase D — Extract credential resolution & options

### D1: Extract request context builder

- Create `handlers/chat/requestContextBuilder.ts` with `buildChatCoreOpts(...)`.

### D2: Extract usage recording callbacks

- Create `handlers/chat/usageRecording.ts` with callback factories.

### D3: Extract project-ID resolution

- Move antigravity/gemini-cli project-ID block into requestContextBuilder.

---

## Phase E — Split the retry engine

### E1: Extract transient retry loop

- Create `handlers/chat/transientRetryLoop.ts` with `executeWithTransientRetry`.

### E2: Extract account fallback loop

- Create `handlers/chat/accountFallbackLoop.ts` with `executeWithAccountFallback`.

### E3: Create single model pipeline

- Create `handlers/chat/singleModelPipeline.ts` with `runSingleModel`.

---

## Phase F — Rewrite handleChat as thin orchestrator

### F1: Rewrite handleChat

- Pure dispatch function (~60-80 lines): parse → auth → combo check → single model.

---

## Phase G — Cleanup & verification

### G1: Delete dead code

- Remove moved functions, unused imports.
- Move WRAPPED_STREAM_MARKER to streamWrapper.ts.

### G2: Final type check

- Verify only lib/redis.ts:166 error.

### G3: Grep sweep

- Fix orphan imports.

### G4: Verify handlers/chat.ts < 150 lines.
