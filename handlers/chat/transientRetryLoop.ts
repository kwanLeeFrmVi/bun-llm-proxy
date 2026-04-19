import { handleChatCore, type ChatCoreOptions } from "../../ai-bridge/handlers/chatCore.ts";
import { TRANSIENT_RETRY, TRANSIENT_ERROR_STATUSES } from "../../ai-bridge/config/runtimeConfig.ts";
import { incrementCircuitBreaker, resetCircuitBreaker } from "../../lib/circuitBreaker.ts";
import * as log from "../../lib/logger.ts";
import type { RequestContext } from "../../lib/requestContext.ts";

export type ChatCoreResult = { success: boolean; response?: Response; status: number; error: string };

/**
 * Execute chatCore with transient-error retry on the same account.
 * Returns the ChatCoreResult (success or final failure).
 */
export async function executeWithTransientRetry(
  chatCoreOpts: ChatCoreOptions,
  connectionId: string,
  connectionName: string,
  model: string,
  ctx: RequestContext
): Promise<ChatCoreResult> {
  let result: ChatCoreResult | null = null;

  for (let attempt = 0; attempt <= TRANSIENT_RETRY.maxAttempts; attempt++) {
    result = (await handleChatCore(chatCoreOpts)) as ChatCoreResult;

    if (result.success) {
      await resetCircuitBreaker(connectionId, model);
      return result;
    }

    // Non-transient error — break immediately, no retry
    if (!TRANSIENT_ERROR_STATUSES.has(result.status)) break;

    // Circuit breaker: skip retries if too many failures already seen
    if (attempt === 0) {
      const totalFailures = await incrementCircuitBreaker(connectionId, model);
      if (totalFailures >= TRANSIENT_RETRY.maxAttempts) {
        log.warn(
          ctx,
          "CHAT",
          `Circuit open for ${connectionName} on ${model} — skipping retries, locking now`
        );
        break;
      }
    }

    // Transient error with retries remaining — back off and retry
    if (attempt < TRANSIENT_RETRY.maxAttempts) {
      const delayMs = TRANSIENT_RETRY.baseDelayMs * (attempt + 1);
      log.warn(
        ctx,
        "CHAT",
        `Transient error ${result.status} on attempt ${attempt + 1}, retrying in ${delayMs}ms...`
      );
      await Bun.sleep(delayMs);
    }
  }

  return result as ChatCoreResult;
}
