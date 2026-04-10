// Port of src/sse/handlers/embeddings.js
// Replaced @/lib/localDb → ../db/index
// Replaced ../utils/logger.js → ../lib/logger

import {
  getProviderCredentials,
  markAccountUnavailable,
  clearAccountError,
} from "../services/auth.ts";
import { checkAuth } from "../lib/authMiddleware.ts";
import { getModelInfo } from "../services/model.ts";
import { handleEmbeddingsCore } from "../ai-bridge/handlers/embeddingsCore.ts";
import { errorResponse, unavailableResponse } from "../ai-bridge/utils/error.ts";
import { HTTP_STATUS, TRANSIENT_RETRY, TRANSIENT_ERROR_STATUSES } from "../ai-bridge/config/runtimeConfig.ts";
import * as log from "../lib/logger.ts";
import { RequestContext } from "../lib/requestContext.ts";
import { updateProviderCredentials, checkAndRefreshToken } from "../services/tokenRefresh.ts";
import { trackPendingRequest, saveRequestUsage, appendRequestLog } from "../stubs/usageDb.ts";

/**
 * Handle embeddings request.
 * Follows the same auth + fallback pattern as handleChat.
 */
export async function handleEmbeddings(request: Request): Promise<Response> {
  // Create request context for log correlation
  const ctx = RequestContext.create();
  const startTime = Date.now();

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    log.warn(ctx, "EMBEDDINGS", "Invalid JSON body");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid JSON body") as Response;
  }

  const url = new URL(request.url);
  const modelStr = body.model as string;

  log.requestStart(ctx, "POST", `${url.pathname} | ${modelStr}`);

  const auth = await checkAuth(request, ctx);
  if (!auth.ok) return auth.response;
  const apiKeyId = auth.apiKeyId;

  if (!modelStr) {
    log.warn(ctx, "EMBEDDINGS", "Missing model");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing model") as Response;
  }

  if (!body.input) {
    log.warn(ctx, "EMBEDDINGS", "Missing input");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing required field: input") as Response;
  }

  const modelInfo = await getModelInfo(modelStr);
  if (!modelInfo.provider) {
    log.warn(ctx, "EMBEDDINGS", "Invalid model format", { model: modelStr });
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid model format") as Response;
  }

  const { provider, model } = modelInfo as { provider: string; model: string };

  const requestId = ctx.id;
  trackPendingRequest(requestId, {
    endpoint: url.pathname,
    provider,
    model,
    apiKeyId: apiKeyId ?? undefined,
  });

  if (modelStr !== `${provider}/${model}`) {
    log.info(ctx, "ROUTING", `${modelStr} → ${provider}/${model}`);
  } else {
    log.info(ctx, "ROUTING", `Provider: ${provider}, Model: ${model}`);
  }

  const excludeConnectionIds = new Set<string>();
  let lastError: string | null = null;
  let lastStatus: number | null = null;

  while (true) {
    const credentials = await getProviderCredentials(provider, excludeConnectionIds, model, ctx);

    if (!credentials || (credentials as Record<string, unknown>).allRateLimited) {
      const creds = credentials as Record<string, unknown> | null;
      if (creds?.allRateLimited) {
        const errorMsg = lastError ?? (creds.lastError as string | undefined) ?? "Unavailable";
        const status = lastStatus ?? (Number(creds.lastErrorCode) || HTTP_STATUS.SERVICE_UNAVAILABLE);
        log.warn(ctx, "EMBEDDINGS", `[${provider}/${model}] ${errorMsg} (${creds.retryAfterHuman})`);
        appendRequestLog(requestId, "rate_limited");
        return unavailableResponse(status, `[${provider}/${model}] ${errorMsg}`, creds.retryAfter as string, creds.retryAfterHuman as string) as Response;
      }
      if (excludeConnectionIds.size === 0) {
        log.warn(ctx, "AUTH", `No credentials for provider: ${provider}`);
        appendRequestLog(requestId, "no_credentials");
        return errorResponse(HTTP_STATUS.BAD_REQUEST, `No credentials for provider: ${provider}`) as Response;
      }
      log.warn(ctx, "EMBEDDINGS", "No more accounts available", { provider });
      appendRequestLog(requestId, "unavailable");
      return errorResponse(lastStatus ?? HTTP_STATUS.SERVICE_UNAVAILABLE, lastError ?? "All accounts unavailable") as Response;
    }

    const creds = credentials as Record<string, unknown>;
    log.info(ctx, "AUTH", `Selected account: ${creds.connectionName}`);

    const refreshedCredentials = await checkAndRefreshToken(provider, creds);

    // Build the request options once so we can reuse them in the retry loop
    const embeddingsCoreOpts = {
      ctx,
      body: { ...body, model: `${provider}/${model}` },
      modelInfo: { provider, model },
      credentials: refreshedCredentials,
      log,
      onCredentialsRefreshed: async (newCreds: Record<string, unknown>) => {
        await updateProviderCredentials(creds.connectionId as string, {
          accessToken: newCreds.accessToken,
          refreshToken: newCreds.refreshToken,
          providerSpecificData: newCreds.providerSpecificData,
          testStatus: "active",
        });
      },
      onRequestSuccess: async () => {
        await clearAccountError(creds.connectionId as string, creds, model, ctx);
      },
      onUsage: async (usage: { prompt_tokens?: number; completion_tokens?: number; reasoning_tokens?: number; cached_tokens?: number }) => {
        await saveRequestUsage(requestId, { ...usage, provider, model }, Date.now() - startTime);
      },
    };

    // ── Retry transient errors on the same account before locking ─────────────────
    type EmbeddingsCoreResult = { success: boolean; response?: Response; status: number; error: string };
    let result: EmbeddingsCoreResult | null = null;
    for (let attempt = 0; attempt <= TRANSIENT_RETRY.maxAttempts; attempt++) {
      result = (await handleEmbeddingsCore(embeddingsCoreOpts)) as EmbeddingsCoreResult;

      if (result.success) {
        RequestContext.delete(ctx.id);
        return result.response!;
      }

      // Non-transient error — break immediately, no retry
      if (!TRANSIENT_ERROR_STATUSES.has(result.status)) break;

      // Transient error with retries remaining — back off and retry
      if (attempt < TRANSIENT_RETRY.maxAttempts) {
        const delayMs = TRANSIENT_RETRY.baseDelayMs * (attempt + 1);
        log.warn(ctx, "EMBEDDINGS", `Transient error ${result.status} on attempt ${attempt + 1}, retrying in ${delayMs}ms...`);
        await Bun.sleep(delayMs);
      }
    }

    // All attempts exhausted (or non-transient error) — lock the account
    const finalResult = result as EmbeddingsCoreResult;
    const { shouldFallback } = await markAccountUnavailable(
      creds.connectionId as string,
      finalResult.status,
      finalResult.error,
      provider,
      model,
      ctx
    );

    if (shouldFallback) {
      log.warn(ctx, "AUTH", `Account ${creds.connectionName} unavailable (${finalResult.status}), trying fallback`);
      excludeConnectionIds.add(creds.connectionId as string);
      lastError = finalResult.error;
      lastStatus = finalResult.status;
      continue;
    }

    appendRequestLog(requestId, `error_${finalResult.status}`);
    RequestContext.delete(ctx.id);
    return finalResult.response ?? errorResponse(finalResult.status ?? HTTP_STATUS.BAD_GATEWAY, finalResult.error ?? "Unknown error");
  }
}
