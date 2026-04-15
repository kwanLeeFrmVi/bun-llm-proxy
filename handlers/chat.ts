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
import { getModelInfo, getFilteredComboModelConfigs } from "../services/model.ts";
import { handleChatCore } from "../ai-bridge/handlers/chatCore.ts";
import { errorResponse, unavailableResponse, sseErrorResponse } from "../ai-bridge/utils/error.ts";
import {
  HTTP_STATUS,
  TRANSIENT_RETRY,
  TRANSIENT_ERROR_STATUSES,
} from "../ai-bridge/config/runtimeConfig.ts";
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
    body = (await request.json()) as Record<string, unknown>;
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

  const msgCount =
    (body.messages as unknown[] | undefined)?.length ??
    (body.input as unknown[] | undefined)?.length ??
    0;
  const toolCount = (body.tools as unknown[] | undefined)?.length ?? 0;
  const effort =
    (body.reasoning_effort as string | undefined) ??
    (body.reasoning as Record<string, unknown> | undefined)?.effort ??
    null;

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
    if (isClaudeStreamingClient(body, request))
      return sseErrorResponse(HTTP_STATUS.BAD_REQUEST, "Missing model");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing model") as Response;
  }

  const comboModels = await getFilteredComboModelConfigs(modelStr);
  if (comboModels) {
    const comboStrategies =
      (settings.comboStrategies as Record<string, Record<string, string>> | undefined) ?? {};
    const comboSpecificStrategy = comboStrategies[modelStr]?.fallbackStrategy;
    const comboStrategy =
      comboSpecificStrategy ?? (settings.comboStrategy as string | undefined) ?? "fallback";

    log.info(
      ctx,
      "ROUTING",
      `${modelStr} → combo (${comboModels.length} models, strategy: ${comboStrategy})`
    );
    const sessionId = request.headers.get("x-claude-code-session-id");
    return handleComboModelWithDB({
      ctx,
      body,
      models: comboModels,
      handleSingleModel: async (b: Record<string, unknown>, m: string) => {
        const resp = await handleSingleModelChat(
          b,
          m,
          clientRawRequest,
          request,
          apiKey,
          apiKeyId,
          ctx
        );
        if (resp.ok) {
          log.info(ctx, "COMBO", `Model ${m} succeeded`);
        }
        return resp;
      },
      comboName: modelStr,
      comboStrategy,
      settings,
      log,
      sessionId,
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
    const comboModels = await getFilteredComboModelConfigs(modelStr);
    if (comboModels) {
      const chatSettings = await getSettings();
      const comboStrategies =
        (chatSettings.comboStrategies as Record<string, Record<string, string>> | undefined) ?? {};
      const comboSpecificStrategy = comboStrategies[modelStr]?.fallbackStrategy;
      const comboStrategy =
        comboSpecificStrategy ?? (chatSettings.comboStrategy as string | undefined) ?? "fallback";

      log.info(
        ctx,
        "ROUTING",
        `${modelStr} → combo (${comboModels.length} models, strategy: ${comboStrategy})`
      );
      const chatSessionId = request?.headers?.get("x-claude-code-session-id") ?? null;
      log.info(ctx ?? null, "[debug]", "header:", request?.headers);
      
      return handleComboModelWithDB({
        ctx,
        body,
        models: comboModels,
        handleSingleModel: async (b: Record<string, unknown>, m: string) => {
          const resp = await handleSingleModelChat(
            b,
            m,
            clientRawRequest,
            request,
            apiKey,
            apiKeyId,
            ctx
          );
          if (resp.ok) {
            log.info(ctx, "COMBO", `Model ${m} succeeded`);
          }
          return resp;
        },
        comboName: modelStr,
        comboStrategy,
        settings: chatSettings,
        log,
        sessionId: chatSessionId,
      });
    }
    log.warn(ctx, "CHAT", "Invalid model format", { model: modelStr });
    if (isClaudeStreamingClient(body, request))
      return sseErrorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid model format");
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
  const isStreaming = body.stream === true;
  trackPendingRequest(requestId, {
    endpoint: request?.url ? new URL(request.url).pathname : undefined,
    provider,
    model,
    apiKeyId: apiKeyId ?? undefined,
    streaming: isStreaming,
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
        const status =
          lastStatus ?? (Number(creds.lastErrorCode) || HTTP_STATUS.SERVICE_UNAVAILABLE);
        log.warn(ctx, "CHAT", `[${provider}/${model}] ${errorMsg} (${creds.retryAfterHuman})`);
        appendRequestLog(requestId, "rate_limited");
        if (isClaudeStreamingClient(body, request))
          return sseErrorResponse(status, `[${provider}/${model}] ${errorMsg}`);
        return unavailableResponse(
          status,
          `[${provider}/${model}] ${errorMsg}`,
          creds.retryAfter as string,
          creds.retryAfterHuman as string
        ) as Response;
      }
      if (excludeConnectionIds.size === 0) {
        log.warn(ctx, "AUTH", `No active credentials for provider: ${provider}`);
        appendRequestLog(requestId, "no_credentials");
        if (isClaudeStreamingClient(body, request))
          return sseErrorResponse(
            HTTP_STATUS.NOT_FOUND,
            `No active credentials for provider: ${provider}`
          );
        return errorResponse(
          HTTP_STATUS.NOT_FOUND,
          `No active credentials for provider: ${provider}`
        ) as Response;
      }
      log.warn(ctx, "CHAT", "No more accounts available", { provider });
      appendRequestLog(requestId, "unavailable");
      if (isClaudeStreamingClient(body, request))
        return sseErrorResponse(
          lastStatus ?? HTTP_STATUS.SERVICE_UNAVAILABLE,
          lastError ?? "All accounts unavailable"
        );
      return errorResponse(
        lastStatus ?? HTTP_STATUS.SERVICE_UNAVAILABLE,
        lastError ?? "All accounts unavailable"
      ) as Response;
    }

    const creds = credentials as Record<string, unknown>;
    const providerName = await getProviderDisplayName(provider);
    log.info(ctx, "AUTH", `Selected account: ${creds.connectionName}`);

    const refreshedCredentials = await checkAndRefreshToken(provider, creds);

    if (
      (provider === "antigravity" || provider === "gemini-cli") &&
      !refreshedCredentials.projectId
    ) {
      const pid = await getProjectIdForConnection(
        creds.connectionId as string,
        refreshedCredentials.accessToken as string
      );
      if (pid) {
        refreshedCredentials.projectId = pid;
        updateProviderCredentials(creds.connectionId as string, { projectId: pid }).catch(() => {});
      }
    }

    const isStreamingLocal = body.stream === true;

    // Log format detection
    const sourceFormat = detectFormat(body);
    const targetFormat = getTargetFormat(provider);
    const isPassthrough = sourceFormat === targetFormat;
    log.formatDetect(ctx, sourceFormat, targetFormat, isStreamingLocal);
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
      sourceFormatOverride: request?.url
        ? (detectFormatByEndpoint(new URL(request.url).pathname, body) ?? undefined)
        : undefined,
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
      onStreamError: (status: number, msg: string) => sseErrorResponse(status, msg),
      onUsage: async (usage: {
        prompt_tokens?: number;
        completion_tokens?: number;
        reasoning_tokens?: number;
        cached_tokens?: number;
      }) => {
        if (!isStreamingLocal) {
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
        if (isStreamingLocal) {
          return wrapStreamingResponse(
            result.response!,
            requestId,
            provider,
            model,
            startTime,
            ctx
          );
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
          log.warn(
            ctx,
            "CHAT",
            `Circuit open for ${creds.connectionName} on ${model} — skipping retries, locking now`
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
      log.warn(
        ctx,
        "AUTH",
        `Account ${creds.connectionName} unavailable (${finalResult.status}), trying fallback`
      );
      excludeConnectionIds.add(creds.connectionId as string);
      lastError = finalResult.error;
      lastStatus = finalResult.status;
      continue;
    }

    appendRequestLog(requestId, `error_${finalResult.status}`);
    if (isStreaming && isClaudeStreamingClient(body, request)) {
      return sseErrorResponse(
        finalResult.status ?? HTTP_STATUS.BAD_GATEWAY,
        finalResult.error ?? "Unknown error"
      );
    }
    return (
      finalResult.response ??
      errorResponse(
        finalResult.status ?? HTTP_STATUS.BAD_GATEWAY,
        finalResult.error ?? "Unknown error"
      )
    );
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

  // ── Diagnostic tracking ──────────────────────────────────────────────────────
  // Mirrors chatCore.ts inner-stream tracking so both sides of the wrapped stream
  // are instrumented and can be correlated via the shared request ID.
  let downstreamCanceled = false; // set true when ReadableStream's cancel() fires
  let downstreamChunkCount = 0;
  let firstDownstreamChunkMs: number | null = null;
  // Possible close reasons: "normal" | "downstream_canceled" | "inner_stream_error"
  type CloseReason = "normal" | "downstream_canceled" | "inner_stream_error";

  // AbortController lets the cancel() callback interrupt the read loop synchronously.
  const abortController = new AbortController();

  const originalBody = response.body;
  const stream = new ReadableStream({
    async start(controller) {
      const reader = originalBody.getReader();
      let controllerClosed = false;
      const safeEnqueue = (chunk: Uint8Array) => {
        if (!controllerClosed) controller.enqueue(chunk);
      };
      const safeClose = () => {
        if (!controllerClosed) {
          controllerClosed = true;
          controller.close();
        }
      };

      let finalUsage: {
        prompt_tokens?: number;
        completion_tokens?: number;
        reasoning_tokens?: number;
        cached_tokens?: number;
      } | null = null;
      let ttftRecorded = false;
      let firstChunkTime: number | null = null;

      try {
        while (true) {
          // Use `as any` to pass the AbortSignal — Bun's types omit the optional
          // ReadableStreamReadOptions parameter but the runtime supports it.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { done, value } = await (reader as any).read({ signal: abortController.signal });
          if (done) break;

          if (!firstChunkTime) firstChunkTime = Date.now();
          if (!firstDownstreamChunkMs) firstDownstreamChunkMs = Date.now() - startTime;
          downstreamChunkCount++;

          // Record TTFT for combo models on first chunk
          if (comboMetadata && !ttftRecorded) {
            const ttftMs = Date.now() - startTime;
            recordComboTTFT(comboMetadata.comboName, comboMetadata.selectedModel, ttftMs).catch(
              () => {}
            );
            ttftRecorded = true;
          }

          // Parse SSE chunks for usage data
          const text = new TextDecoder().decode(value);
          for (const line of text.split("\n")) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                // Read usage from top-level (OpenAI/Gemini) or nested in message (Claude message_start)
                const usageSource =
                  data.usage && typeof data.usage === "object"
                    ? data.usage
                    : data.message?.usage && typeof data.message.usage === "object"
                      ? data.message.usage
                      : null;
                if (usageSource) {
                  finalUsage = {
                    prompt_tokens: usageSource.prompt_tokens ?? usageSource.input_tokens ?? 0,
                    completion_tokens:
                      usageSource.completion_tokens ?? usageSource.output_tokens ?? 0,
                    reasoning_tokens:
                      usageSource.reasoning_tokens ?? usageSource.thinking_tokens ?? 0,
                    cached_tokens: usageSource.prompt_tokens_details?.cached_tokens ?? 0,
                  };
                }
              } catch {
                /* skip non-JSON SSE lines */
              }
            }
          }

          safeEnqueue(value);
        }
        const durationMs = Date.now() - startTime;
        log.stream(ctx, "OUTER_COMPLETE", {
          provider,
          model,
          usage: finalUsage,
          closeReason: "normal" as CloseReason,
          downstreamChunkCount,
          firstDownstreamChunkMs,
          durationMs,
        });
        safeClose();
      } catch (err) {
        const durationMs = Date.now() - startTime;
        const errMsg = err instanceof Error ? err.message : String(err);
        const reason: CloseReason = downstreamCanceled
          ? "downstream_canceled"
          : "inner_stream_error";
        log.stream(ctx, "OUTER_ERROR", {
          provider,
          model,
          error: errMsg,
          closeReason: reason,
          downstreamChunkCount,
          firstDownstreamChunkMs,
          durationMs,
        });
        // Only inject error event if downstream is still writable (not already canceled)
        if (!controllerClosed) {
          try {
            const errorPayload = JSON.stringify({
              error: { message: `Stream error: ${errMsg}`, type: "proxy_error" },
            });
            safeEnqueue(new TextEncoder().encode(`data: ${errorPayload}\n\n`));
          } catch { /* ignore encoding errors */ }
        }
        safeClose();
      } finally {
        reader.releaseLock();
        const durationMs = Date.now() - startTime;
        const ttftMs = firstChunkTime ? firstChunkTime - startTime : undefined;
        const completionTokens = finalUsage?.completion_tokens ?? 0;
        const tokensPerSecond =
          ttftMs && completionTokens > 0 && durationMs > ttftMs
            ? (completionTokens / (durationMs - ttftMs)) * 1000
            : undefined;
        saveRequestUsage(
          requestId,
          {
            ...(finalUsage ?? {}),
            provider,
            model,
            ttft_ms: ttftMs,
            tokens_per_second: tokensPerSecond,
          },
          durationMs
        ).catch(() => {});
        RequestContext.delete(ctx.id);
      }
    },
    cancel() {
      downstreamCanceled = true;
      abortController.abort();
    },
  });

  return new Response(stream, {
    status: response.status,
    headers: response.headers,
  });
}

// ─── Combo model routing strategies ─────────────────────────────────────────────

// Wrapper for handleComboModel that injects getAverageTTFT
async function handleComboModelWithDB(
  opts: Parameters<typeof handleComboModel>[0] & { ctx: RequestContext }
): Promise<Response> {
  return handleComboModel({
    ...opts,
    getAverageTTFT,
  });
}
