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
import { getSettings } from "../db/index.ts";
import { getModelInfo, getComboModels } from "../services/model.ts";
import { handleChatCore } from "../ai-bridge/handlers/chatCore.ts";
import { errorResponse, unavailableResponse } from "../ai-bridge/utils/error.ts";
import { HTTP_STATUS } from "../ai-bridge/config/runtimeConfig.ts";
import { detectFormatByEndpoint } from "../ai-bridge/translator/formats.ts";
import * as log from "../lib/logger.ts";
import { updateProviderCredentials, checkAndRefreshToken } from "../services/tokenRefresh.ts";
import { getProjectIdForConnection } from "../services/tokenRefresh.ts";
import { trackPendingRequest, saveRequestUsage, appendRequestLog } from "../stubs/usageDb.ts";
import { FORMATS } from "../ai-bridge/translator/formats.ts";
import { detectFormat } from "../ai-bridge/handlers/provider.ts";
import { getTargetFormat } from "../ai-bridge/handlers/provider.js";

/**
 * Handle chat completion request.
 * Supports: OpenAI, Claude, Gemini, OpenAI Responses API formats.
 */
export async function handleChat(
  request: Request,
  clientRawRequest: Record<string, unknown> | null = null
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    log.warn("CHAT", "Invalid JSON body");
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
  log.request("POST", `${url.pathname} | ${modelStr} | ${msgCount} msgs${toolCount ? ` | ${toolCount} tools` : ""}${effort ? ` | effort=${effort}` : ""}`);

  const auth = await checkAuth(request);
  if (!auth.ok) return auth.response;
  const apiKey = auth.apiKey;
  const apiKeyId = auth.apiKeyId;

  const settings = await getSettings();

  if (!modelStr) {
    log.warn("CHAT", "Missing model");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing model") as Response;
  }

  const comboModels = await getComboModels(modelStr);
  if (comboModels) {
    const comboStrategies = (settings.comboStrategies as Record<string, Record<string, string>> | undefined) ?? {};
    const comboSpecificStrategy = comboStrategies[modelStr]?.fallbackStrategy;
    const comboStrategy = comboSpecificStrategy ?? (settings.comboStrategy as string | undefined) ?? "fallback";

    log.info("CHAT", `Combo "${modelStr}" with ${comboModels.length} models (strategy: ${comboStrategy})`);
    return handleComboModelFallback({
      body,
      models: comboModels,
      handleSingleModel: async (b: Record<string, unknown>, m: string) => {
        const resp = await handleSingleModelChat(b, m, clientRawRequest, request, apiKey);
        if (resp.ok) {
          log.info("COMBO", `Model ${m} succeeded`);
        }
        return resp;
      },
      log,
      comboName: modelStr,
      comboStrategy,
    });
  }

  return handleSingleModelChat(body, modelStr, clientRawRequest, request, apiKey, apiKeyId);
}

/**
 * Handle single model chat request
 */
async function handleSingleModelChat(
  body: Record<string, unknown>,
  modelStr: string,
  clientRawRequest: Record<string, unknown> | null = null,
  request: Request | null = null,
  apiKey: string | null = null,
  apiKeyId: string | null = null
): Promise<Response> {
  const modelInfo = await getModelInfo(modelStr);

  if (!modelInfo.provider) {
    const comboModels = await getComboModels(modelStr);
    if (comboModels) {
      const chatSettings = await getSettings();
      const comboStrategies = (chatSettings.comboStrategies as Record<string, Record<string, string>> | undefined) ?? {};
      const comboSpecificStrategy = comboStrategies[modelStr]?.fallbackStrategy;
      const comboStrategy = comboSpecificStrategy ?? (chatSettings.comboStrategy as string | undefined) ?? "fallback";

      log.info("CHAT", `Combo "${modelStr}" with ${comboModels.length} models (strategy: ${comboStrategy})`);
      return handleComboModelFallback({
        body,
        models: comboModels,
        handleSingleModel: async (b: Record<string, unknown>, m: string) => {
          const resp = await handleSingleModelChat(b, m, clientRawRequest, request, apiKey, apiKeyId);
          if (resp.ok) {
            log.info("COMBO", `Model ${m} succeeded`);
          }
          return resp;
        },
        log,
        comboName: modelStr,
        comboStrategy,
      });
    }
    log.warn("CHAT", "Invalid model format", { model: modelStr });
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid model format") as Response;
  }

  const { provider, model } = modelInfo as { provider: string; model: string };

  if (modelStr !== `${provider}/${model}`) {
    log.info("ROUTING", `${modelStr} → ${provider}/${model}`);
  } else {
    log.info("ROUTING", `Provider: ${provider}, Model: ${model}`);
  }

  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  trackPendingRequest(requestId, {
    endpoint: request?.url ? new URL(request.url).pathname : undefined,
    provider,
    model,
    apiKeyId: apiKeyId ?? undefined,
  });
  log.pending(provider, model);

  const userAgent = request?.headers?.get("user-agent") ?? "";

  const excludeConnectionIds = new Set<string>();
  let lastError: string | null = null;
  let lastStatus: number | null = null;

  while (true) {
    const credentials = await getProviderCredentials(provider, excludeConnectionIds, model);

    if (!credentials || (credentials as Record<string, unknown>).allRateLimited) {
      const creds = credentials as Record<string, unknown> | null;
      if (creds?.allRateLimited) {
        const errorMsg = lastError ?? (creds.lastError as string | undefined) ?? "Unavailable";
        const status = lastStatus ?? (Number(creds.lastErrorCode) || HTTP_STATUS.SERVICE_UNAVAILABLE);
        log.warn("CHAT", `[${provider}/${model}] ${errorMsg} (${creds.retryAfterHuman})`);
        appendRequestLog(requestId, "rate_limited");
        return unavailableResponse(status, `[${provider}/${model}] ${errorMsg}`, creds.retryAfter as string, creds.retryAfterHuman as string) as Response;
      }
      if (excludeConnectionIds.size === 0) {
        log.warn("AUTH", `No active credentials for provider: ${provider}`);
        appendRequestLog(requestId, "no_credentials");
        return errorResponse(HTTP_STATUS.NOT_FOUND, `No active credentials for provider: ${provider}`) as Response;
      }
      log.warn("CHAT", "No more accounts available", { provider });
      appendRequestLog(requestId, "unavailable");
      return errorResponse(lastStatus ?? HTTP_STATUS.SERVICE_UNAVAILABLE, lastError ?? "All accounts unavailable") as Response;
    }

    const creds = credentials as Record<string, unknown>;
    log.info("AUTH", `\x1b[32mUsing ${provider} account: ${creds.connectionName}\x1b[0m`);

    const refreshedCredentials = await checkAndRefreshToken(provider, creds);

    if ((provider === "antigravity" || provider === "gemini-cli") && !refreshedCredentials.projectId) {
      const pid = await getProjectIdForConnection(creds.connectionId as string, refreshedCredentials.accessToken as string);
      if (pid) {
        refreshedCredentials.projectId = pid;
        updateProviderCredentials(creds.connectionId as string, { projectId: pid }).catch(() => {});
      }
    }

    const chatSettings = await getSettings();
    const isStreaming = body.stream !== false;

    // Log format detection
    const sourceFormat = detectFormat(body);
    const targetFormat = getTargetFormat(provider);
    const isPassthrough = sourceFormat === targetFormat;
    log.formatDetect(sourceFormat, targetFormat, isStreaming);
    if (isPassthrough) {
      log.passthrough(sourceFormat, targetFormat, "native lossless");
    }

    const result = await handleChatCore({
      body: { ...body, model: `${provider}/${model}` },
      modelInfo: { provider, model },
      credentials: refreshedCredentials,
      log,
      clientRawRequest: clientRawRequest ?? undefined,
      connectionId: creds.connectionId as string | undefined,
      userAgent,
      apiKey,
      ccFilterNaming: !!(chatSettings.ccFilterNaming as boolean | undefined),
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
        await clearAccountError(creds.connectionId as string, creds, model);
      },
      onUsage: async (usage) => {
        if (!isStreaming) {
          // For non-streaming, save usage immediately
          await saveRequestUsage(requestId, {
            ...usage,
            provider,
            model,
          }, Date.now() - startTime);
        }
        // For streaming, usage is saved by wrapStreamingResponse after the stream ends
      },
    }) as { success: boolean; response: Response; status: number; error: string };

    if (result.success) {
      if (isStreaming) {
        return wrapStreamingResponse(result.response, requestId, provider, model, startTime);
      }
      return result.response;
    }

    const { shouldFallback } = await markAccountUnavailable(
      creds.connectionId as string,
      result.status,
      result.error,
      provider,
      model
    );

    if (shouldFallback) {
      log.warn("AUTH", `Account ${creds.connectionName} unavailable (${result.status}), trying fallback`);
      excludeConnectionIds.add(creds.connectionId as string);
      lastError = result.error;
      lastStatus = result.status;
      continue;
    }

    appendRequestLog(requestId, `error_${result.status}`);
    return result.response ?? errorResponse(result.status ?? HTTP_STATUS.BAD_GATEWAY, result.error ?? "Unknown error");
  }
}

/**
 * Wrap a streaming Response to intercept SSE chunks, parse usage data,
 * and call saveRequestUsage when the stream completes or errors.
 */
function wrapStreamingResponse(
  response: Response,
  requestId: string,
  provider: string,
  model: string,
  startTime: number
): Response {
  if (!response.body) return response;

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

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Parse SSE chunks for usage data
          const text = new TextDecoder().decode(value);
          for (const line of text.split("\n")) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.usage) {
                  finalUsage = {
                    prompt_tokens: data.usage.prompt_tokens ?? data.usage.input_tokens,
                    completion_tokens: data.usage.completion_tokens ?? data.usage.output_tokens,
                    reasoning_tokens: data.usage.reasoning_tokens ?? data.usage.thinking_tokens,
                    cached_tokens: data.usage.prompt_tokens_details?.cached_tokens,
                  };
                }
              } catch { /* skip non-JSON SSE lines */ }
            }
          }

          controller.enqueue(value);
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      } finally {
        reader.releaseLock();
        const durationMs = Date.now() - startTime;
        saveRequestUsage(requestId, {
          ...(finalUsage ?? {}),
          provider,
          model,
        }, durationMs).catch(() => {});
      }
    },
  });

  return new Response(stream, {
    status: response.status,
    headers: response.headers,
  });
}

// ─── Combo model fallback ───────────────────────────────────────────────────────

interface ComboOptions {
  body: Record<string, unknown>;
  models: string[];
  handleSingleModel: (body: Record<string, unknown>, model: string) => Promise<Response>;
  log: { info: (ctx: string, msg: string) => void; warn: (ctx: string, msg: string) => void };
  comboName: string;
  comboStrategy: string;
}

/**
 * Try models in order until one succeeds.
 * fallback: use first model that succeeds.
 * round-robin: rotate through models, succeed on first.
 */
async function handleComboModelFallback(opts: ComboOptions): Promise<Response> {
  const { body, models, handleSingleModel, log, comboName, comboStrategy } = opts;

  if (comboStrategy === "round-robin") {
    const index = (handleComboModelFallback as unknown as { _rrIndex?: number })._rrIndex ?? 0;
    const model = models[index % models.length]!;
    (handleComboModelFallback as unknown as { _rrIndex: number })._rrIndex = index + 1;
    log.info("COMBO", `Round-robin: trying ${model} (index ${index})`);
    return handleSingleModel(body, model);
  }

  // fallback: try each model in order
  let lastError: string | null = null;
  let attemptNumber = 1;
  for (const model of models) {
    log.info("COMBO", `Trying model ${attemptNumber}/${models.length}: ${model}`);
    try {
      const resp = await handleSingleModel(body, model);
      if (resp.ok) return resp;
      lastError = `Model ${model} returned status ${resp.status}`;
    } catch (e) {
      lastError = `${model}: ${e instanceof Error ? e.message : String(e)}`;
    }
    attemptNumber++;
  }

  return new Response(JSON.stringify({ error: lastError ?? "All combo models failed" }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
}
