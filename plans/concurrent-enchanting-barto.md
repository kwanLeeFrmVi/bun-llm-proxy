# Plan: Retry Before Locking on 502/Transient Errors

## Context

The `pro-x` provider has 2 unreliable accounts (`tobi250`, `tobi450`) that frequently return 502 Bad Gateway errors. Currently, **each 502 immediately locks the account** (calling `markAccountUnavailable`), which forces a switch to the fallback account even if the error is transient and the same account would succeed on retry.

From the logs:
- `tobi450` gets a 120s lock on 502 → `tobi250` tried next
- `tobi250` gets a 1s lock on 502 → next request immediately retries and succeeds
- This pattern wastes accounts and adds latency

## Goal

**Before locking an account after a transient error (502/503/504/etc.), retry the same account 1-2 more times with a short delay.** Only lock if all retries fail. This should significantly improve reliability with unreliable upstream providers.

## Where to Make Changes

**File: `handlers/chat.ts`** — `handleSingleModelChat` function, inside the `while(true)` loop, after `handleChatCore` returns a failure result.

## Implementation

### Option: Inline Retry in `handleSingleModelChat` (Recommended)

Add a retry loop inside the existing `while(true)` loop — retry on transient errors (502/503/504) before calling `markAccountUnavailable`.

**Change to `handlers/chat.ts`:**

After `const result = await handleChatCore(...)`, when `result.success` is false, check if the error is transient:

```ts
// Retry transient errors before locking
const TRANSIENT_ERRORS = new Set([502, 503, 504]);
const MAX_RETRIES = 2;

if (!result.success && TRANSIENT_ERRORS.has(result.status)) {
  for (let retry = 1; retry <= MAX_RETRIES; retry++) {
    await Bun.sleep(250 * retry); // 250ms, then 500ms backoff
    const retryResult = await handleChatCore({ ...same opts... }) as ChatCoreResult;
    if (retryResult.success) {
      // Handle success like normal — wrap stream, return response
      ...
    }
    lastError = retryResult.error;
    lastStatus = retryResult.status;
  }
  // All retries exhausted — proceed to lock
}
```

**Config:** Use a new constant in `runtimeConfig.ts` for `MAX_TRANSIENT_RETRIES = 2`.

## Files to Modify

1. **`ai-bridge/config/runtimeConfig.ts`** — Add:
   ```ts
   export const MAX_TRANSIENT_RETRIES = 2;
   export const TRANSIENT_RETRY_BASE_DELAY_MS = 250;
   ```

2. **`handlers/chat.ts`** — Modify `handleSingleModelChat`:
   - After `handleChatCore` returns `{ success: false, status: 502/503/504 }`, retry up to `MAX_TRANSIENT_RETRIES` times
   - Only call `markAccountUnavailable` after all retries are exhausted
   - Increment retry counter and apply exponential backoff (250ms × retry)

## Verification

1. Run existing tests: `bun test`
2. Check that the 502 on `tobi450` no longer immediately locks — it should retry twice first
3. The 1s lock on `tobi250` after a 502 that succeeds on retry should no longer appear
4. The `[AUTH] tobi250 cleared lock` message should still appear when requests succeed
