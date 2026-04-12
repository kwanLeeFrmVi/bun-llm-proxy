// Port of src/sse/handlers/chat.js
// Replaced @/lib/localDb → ../db/index
// Replaced ../utils/logger.js → ../lib/logger

import {
  getProviderCredentials,
  markAccountUnavailable,
  clearAccountError,
} from "../services/auth.ts";
import { checkAuth } from "../lib/authMiddleware.ts";
import { cacheClaudeHeaders } from "../ai-bridge/utils/claudeHeaderCache.ts";
import { getSettings, getAverageTTFT, recordComboTTFT } from "../db/index.ts";
import { getModelInfo, getComboModelConfigs } from "../services/model.ts";
import { handleChatCore } from "../ai-bridge/handlers/chatCore.ts";
import { errorResponse, unavailableResponse, sseErrorResponse } from "../ai-bridge/utils/error.ts";
import { HTTP_STATUS, TRANSIENT_RETRY, TRANSIENT_ERROR_STATUSES } from "../ai-bridge/config/runtimeConfig.ts";
import { detectFormatByEndpoint } from "../ai-bridge/translator/formats.ts";
import * as log from "../lib/logger.ts";
import { RequestContext } from "../lib/requestContext.ts";
import { updateProviderCredentials, checkAndRefreshToken } from "../services/tokenRefresh.ts";
import { getProjectIdForConnection } from "../services/tokenRefresh.ts";
import { trackPendingRequest, saveRequestUsage, appendRequestLog } from "../stubs/usageDb.ts";
import { detectFormat } from "../ai-bridge/handlers/provider.ts";
import { getTargetFormat } from "../ai-bridge/handlers/provider.js";
import { getProviderDisplayName } from "../lib/providers.ts";
import { handleComboModel, getComboMetadata } from "../services/comboRouting.ts";
import { incrementCircuitBreaker, resetCircuitBreaker } from "../lib/circuitBreaker.ts";

function isClaudeStreamingClient(body: Record<string, unknown>, request: Request | null): boolean {
  if (body.stream === false) return false;
  const endpoint = request?.url ? new URL(request.url).pathname : "";
  const fmt = detectFormatByEndpoint(endpoint, body) ?? detectFormat(body);
  return fmt === "claude";
}

type ClientRawRequest = {
  endpoint: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
};

/**
 * Handle chat completion request.
 * Supports: OpenAI, Claude, Gemini, OpenAI Responses API formats.
 */
export async function handleChat(
  request: Request,
  clientRawRequest: ClientRawRequest | null = null
): Promise<Response> {
  // Create request context for log correlation
  const ctx = RequestContext.create();
  const startTime = Date.now();

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    log.warn(ctx, "CHAT", "Invalid JSON body");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid JSON body") as Response;
  }

  if (!clientRawRequest) {
    const url = new URL(request.url);
    clientRawRequest = {
      endpoint: url.pathname,
      body,
      headers: Object.fromEntries(request.headers.entries()),
    };
  }
  cacheClaudeHeaders(clientRawRequest.headers as Record<string, string>);

  const url = new URL(request.url);
  const modelStr = body.model as string;

  const msgCount = (body.messages as unknown[] | undefined)?.length ?? (body.input as unknown[] | undefined)?.length ?? 0;
  const toolCount = (body.tools as unknown[] | undefined)?.length ?? 0;
  const effort = (body.reasoning_effort as string | undefined) ?? (body.reasoning as Record<string, unknown> | undefined)?.effort ?? null;

  // Build extra info for request log
  const extraParts = [`model=${modelStr}`, `${msgCount} msgs`];
  if (toolCount) extraParts.push(`${toolCount} tools`);
  if (effort) extraParts.push(`effort=${effort}`);
  log.requestStart(ctx, "POST", url.pathname, extraParts.join(" | "));

  const auth = await checkAuth(request, ctx);
  if (!auth.ok) return auth.response;
  const apiKey = auth.apiKey;
  const apiKeyId = auth.apiKeyId;

  const settings = await getSettings();

  if (!modelStr) {
    log.warn(ctx, "CHAT", "Missing model");
    if (isClaudeStreamingClient(body, request)) return sseErrorResponse(HTTP_STATUS.BAD_REQUEST, "Missing model");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing model") as Response;
  }

  const comboModels = await getComboModelConfigs(modelStr);
  if (comboModels) {
    const comboStrategies = (settings.comboStrategies as Record<string, Record<string, string>> | undefined) ?? {};
    const comboSpecificStrategy = comboStrategies[modelStr]?.fallbackStrategy;
    const comboStrategy = comboSpecificStrategy ?? (settings.comboStrategy as string | undefined) ?? "fallback";

    log.info(ctx, "ROUTING", `${modelStr} → combo (${comboModels.length} models, strategy: ${comboStrategy})`);
    return handleComboModelWithDB({
      ctx,
      body,
      models: comboModels,
      handleSingleModel: async (b: Record<string, unknown>, m: string) => {
        const resp = await handleSingleModelChat(b, m, clientRawRequest, request, apiKey, apiKeyId, ctx);
        if (resp.ok) {
          log.info(ctx, "COMBO", `Model ${m} succeeded`);
        }
        return resp;
      },
      comboName: modelStr,
      comboStrategy,
      settings,
      log,
    });
  }

  return handleSingleModelChat(body, modelStr, clientRawRequest, request, apiKey, apiKeyId, ctx);
}

/**
 * Handle single model chat request
 */
async function handleSingleModelChat(
  body: Record<string, unknown>,
  modelStr: string,
  clientRawRequest: ClientRawRequest | null = null,
  request: Request | null = null,
  apiKey: string | null = null,
  apiKeyId: string | null = null,
  ctx: RequestContext
): Promise<Response> {
  const modelInfo = await getModelInfo(modelStr);

  if (!modelInfo.provider) {
    const comboModels = await getComboModelConfigs(modelStr);
    if (comboModels) {
      const chatSettings = await getSettings();
      const comboStrategies = (chatSettings.comboStrategies as Record<string, Record<string, string>> | undefined) ?? {};
      const comboSpecificStrategy = comboStrategies[modelStr]?.fallbackStrategy;
      const comboStrategy = comboSpecificStrategy ?? (chatSettings.comboStrategy as string | undefined) ?? "fallback";

      log.info(ctx, "ROUTING", `${modelStr} → combo (${comboModels.length} models, strategy: ${comboStrategy})`);
      return handleComboModelWithDB({
        ctx,
        body,
        models: comboModels,
        handleSingleModel: async (b: Record<string, unknown>, m: string) => {
          const resp = await handleSingleModelChat(b, m, clientRawRequest, request, apiKey, apiKeyId, ctx);
          if (resp.ok) {
            log.info(ctx, "COMBO", `Model ${m} succeeded`);
          }
          return resp;
        },
        comboName: modelStr,
        comboStrategy,
        settings: chatSettings,
        log,
      });
    }
    log.warn(ctx, "CHAT", "Invalid model format", { model: modelStr });
    if (isClaudeStreamingClient(body, request)) return sseErrorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid model format");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid model format") as Response;
  }

  const { provider, model } = modelInfo as { provider: string; model: string };

  if (modelStr !== `${provider}/${model}`) {
    log.info(ctx, "ROUTING", `${modelStr} → ${provider}/${model}`);
  } else {
    log.info(ctx, "ROUTING", `Provider: ${provider}, Model: ${model}`);
  }

  const requestId = ctx.id;
  const startTime = Date.now();
  trackPendingRequest(requestId, {
    endpoint: request?.url ? new URL(request.url).pathname : undefined,
    provider,
    model,
    apiKeyId: apiKeyId ?? undefined,
  });
  await log.pending(ctx, provider, model);

  const userAgent = request?.headers?.get("user-agent") ?? "";

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
        log.warn(ctx, "CHAT", `[${provider}/${model}] ${errorMsg} (${creds.retryAfterHuman})`);
        appendRequestLog(requestId, "rate_limited");
        if (isClaudeStreamingClient(body, request)) return sseErrorResponse(status, `[${provider}/${model}] ${errorMsg}`);
        return unavailableResponse(status, `[${provider}/${model}] ${errorMsg}`, creds.retryAfter as string, creds.retryAfterHuman as string) as Response;
      }
      if (excludeConnectionIds.size === 0) {
        log.warn(ctx, "AUTH", `No active credentials for provider: ${provider}`);
        appendRequestLog(requestId, "no_credentials");
        if (isClaudeStreamingClient(body, request)) return sseErrorResponse(HTTP_STATUS.NOT_FOUND, `No active credentials for provider: ${provider}`);
        return errorResponse(HTTP_STATUS.NOT_FOUND, `No active credentials for provider: ${provider}`) as Response;
      }
      log.warn(ctx, "CHAT", "No more accounts available", { provider });
      appendRequestLog(requestId, "unavailable");
      if (isClaudeStreamingClient(body, request)) return sseErrorResponse(lastStatus ?? HTTP_STATUS.SERVICE_UNAVAILABLE, lastError ?? "All accounts unavailable");
      return errorResponse(lastStatus ?? HTTP_STATUS.SERVICE_UNAVAILABLE, lastError ?? "All accounts unavailable") as Response;
    }

    const creds = credentials as Record<string, unknown>;
    const providerName = await getProviderDisplayName(provider);
    log.info(ctx, "AUTH", `Selected account: ${creds.connectionName}`);

    const refreshedCredentials = await checkAndRefreshToken(provider, creds);

    if ((provider === "antigravity" || provider === "gemini-cli") && !refreshedCredentials.projectId) {
      const pid = await getProjectIdForConnection(creds.connectionId as string, refreshedCredentials.accessToken as string);
      if (pid) {
        refreshedCredentials.projectId = pid;
        updateProviderCredentials(creds.connectionId as string, { projectId: pid }).catch(() => {});
      }
    }

    const isStreaming = body.stream !== false;

    // Log format detection
    const sourceFormat = detectFormat(body);
    const targetFormat = getTargetFormat(provider);
    const isPassthrough = sourceFormat === targetFormat;
    log.formatDetect(ctx, sourceFormat, targetFormat, isStreaming);
    if (isPassthrough) {
      log.passthrough(ctx, sourceFormat, targetFormat, "native lossless");
    }

    // Build the request options once so we can reuse them in the retry loop
    const chatCoreOpts = {
      ctx,
      body: { ...body, model: `${provider}/${model}` },
      modelInfo: { provider, model },
      credentials: refreshedCredentials,
      clientRawRequest: clientRawRequest ?? undefined,
      connectionId: creds.connectionId as string | undefined,
      userAgent,
      apiKey,
      sourceFormatOverride: request?.url ? detectFormatByEndpoint(new URL(request.url).pathname, body) ?? undefined : undefined,
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
        if (!isStreaming) {
          await saveRequestUsage(requestId, { ...usage, provider, model }, Date.now() - startTime);
        }
      },
    };

    // ── Retry transient errors on the same account before locking ─────────────────
    type ChatCoreResult = { success: boolean; response?: Response; status: number; error: string };
    let result: ChatCoreResult | null = null;
    for (let attempt = 0; attempt <= TRANSIENT_RETRY.maxAttempts; attempt++) {
      result = (await handleChatCore(chatCoreOpts)) as ChatCoreResult;

      if (result.success) {
        await resetCircuitBreaker(creds.connectionId as string, model);
        if (isStreaming) {
          return wrapStreamingResponse(result.response!, requestId, provider, model, startTime, ctx);
        }
        return result.response!;
      }

      // Non-transient error — break immediately, no retry
      if (!TRANSIENT_ERROR_STATUSES.has(result.status)) break;

      // ── Circuit breaker: skip retries if too many failures already seen ─────
      // Only check on first attempt — subsequent retries are this request's own failures
      if (attempt === 0) {
        const totalFailures = await incrementCircuitBreaker(creds.connectionId as string, model);
        if (totalFailures >= TRANSIENT_RETRY.maxAttempts) {
          log.warn(ctx, "CHAT", `Circuit open for ${creds.connectionName} on ${model} — skipping retries, locking now`);
          break;
        }
      }

      // Transient error with retries remaining — back off and retry
      if (attempt < TRANSIENT_RETRY.maxAttempts) {
        const delayMs = TRANSIENT_RETRY.baseDelayMs * (attempt + 1);
        log.warn(ctx, "CHAT", `Transient error ${result.status} on attempt ${attempt + 1}, retrying in ${delayMs}ms...`);
        await Bun.sleep(delayMs);
      }
    }

    // All attempts exhausted (or non-transient error) — lock the account
    const finalResult = result as ChatCoreResult;
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
    if (isStreaming && isClaudeStreamingClient(body, request)) {
      return sseErrorResponse(finalResult.status ?? HTTP_STATUS.BAD_GATEWAY, finalResult.error ?? "Unknown error");
    }
    return finalResult.response ?? errorResponse(finalResult.status ?? HTTP_STATUS.BAD_GATEWAY, finalResult.error ?? "Unknown error");
  }
}

/**
 * Wrap a streaming Response to intercept SSE chunks, parse usage data,
 * record TTFT for combo models, and call saveRequestUsage when the stream completes or errors.
 */
function wrapStreamingResponse(
  response: Response,
  requestId: string,
  provider: string,
  model: string,
  startTime: number,
  ctx: RequestContext
): Response {
  if (!response.body) return response;

  const comboMetadata = getComboMetadata(response);

  const originalBody = response.body;
  const stream = new ReadableStream({
    async start(controller) {
      const reader = originalBody.getReader();
      let finalUsage: {
        prompt_tokens?: number;
        completion_tokens?: number;
        reasoning_tokens?: number;
        cached_tokens?: number;
      } | null = null;
      let ttftRecorded = false;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Record TTFT for combo models on first chunk
          if (comboMetadata && !ttftRecorded) {
            const ttftMs = Date.now() - startTime;
            recordComboTTFT(comboMetadata.comboName, comboMetadata.selectedModel, ttftMs).catch(() => {});
            ttftRecorded = true;
          }

          // Parse SSE chunks for usage data
          const text = new TextDecoder().decode(value);
          for (const line of text.split("\n")) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                // Read usage from top-level (OpenAI/Gemini) or nested in message (Claude message_start)
                const usageSource = (data.usage && typeof data.usage === 'object')
                  ? data.usage
                  : (data.message?.usage && typeof data.message.usage === 'object')
                    ? data.message.usage
                    : null;
                if (usageSource) {
                  finalUsage = {
                    prompt_tokens: (usageSource.prompt_tokens ?? usageSource.input_tokens) ?? 0,
                    completion_tokens: (usageSource.completion_tokens ?? usageSource.output_tokens) ?? 0,
                    reasoning_tokens: (usageSource.reasoning_tokens ?? usageSource.thinking_tokens) ?? 0,
                    cached_tokens: usageSource.prompt_tokens_details?.cached_tokens ?? 0,
                  };
                }
              } catch { /* skip non-JSON SSE lines */ }
            }
          }

          controller.enqueue(value);
        }
        const durationMs = Date.now() - startTime;
        log.stream(ctx, "COMPLETE", { provider, model, usage: finalUsage });
        controller.close();
      } catch (err) {
        const durationMs = Date.now() - startTime;
        const errMsg = err instanceof Error ? err.message : String(err);
        log.stream(ctx, "ERROR", { provider, model, duration: `${durationMs}ms`, error: errMsg });
        controller.error(err);
      } finally {
        reader.releaseLock();
        const durationMs = Date.now() - startTime;
        saveRequestUsage(requestId, {
          ...(finalUsage ?? {}),
          provider,
          model,
        }, durationMs).catch(() => {});
        RequestContext.delete(ctx.id);
      }
    },
  });

  return new Response(stream, {
    status: response.status,
    headers: response.headers,
  });
}

// ─── Combo model routing strategies ─────────────────────────────────────────────

// Wrapper for handleComboModel that injects getAverageTTFT
async function handleComboModelWithDB(opts: Parameters<typeof handleComboModel>[0] & { ctx: RequestContext }): Promise<Response> {
  return handleComboModel({
    ...opts,
    getAverageTTFT,
  });
}
