import { getProviderCredentials, markAccountUnavailable } from "../../services/auth.ts";
import { unavailableResponse, errorResponse } from "../../ai-bridge/utils/error.ts";
import { HTTP_STATUS } from "../../ai-bridge/config/runtimeConfig.ts";
import * as log from "../../lib/logger.ts";
import { RequestContext } from "../../lib/requestContext.ts";
import { appendRequestLog } from "../../stubs/usageDb.ts";
import { buildChatCoreOpts } from "./requestContextBuilder.ts";
import { executeWithTransientRetry } from "./transientRetryLoop.ts";
import { formatAwareErrorResponse } from "./errorShaping.ts";
import { classifyNetworkError } from "./networkErrorClassify.ts";
import { wrapStreamingResponseV2, isAlreadyWrappedStream } from "../streamWrapper.ts";
import { type ClientRawRequest } from "./bodyParser.ts";

export interface AccountFallbackOpts {
  body: Record<string, unknown>;
  provider: string;
  model: string;
  clientRawRequest: ClientRawRequest | null;
  request: Request | null;
  apiKey: string | null;
  apiKeyId: string | null;
  ctx: RequestContext;
  requestId: string;
  startTime: number;
  userAgent: string;
}

/**
 * Execute the account fallback loop: try credentials, retry transients,
 * mark unavailable and try next account on failure.
 */
export async function executeWithAccountFallback(opts: AccountFallbackOpts): Promise<Response> {
  const {
    body, provider, model, clientRawRequest, request, apiKey, apiKeyId,
    ctx, requestId, startTime, userAgent,
  } = opts;

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
        
        if (body.stream === true) {
          return formatAwareErrorResponse(body, request, status, `[${provider}/${model}] ${errorMsg}`);
        }
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
        return formatAwareErrorResponse(body, request, HTTP_STATUS.NOT_FOUND, `No active credentials for provider: ${provider}`);
      }
      log.warn(ctx, "CHAT", "No more accounts available", { provider });
      appendRequestLog(requestId, "unavailable");
      return formatAwareErrorResponse(body, request, lastStatus ?? HTTP_STATUS.SERVICE_UNAVAILABLE, lastError ?? "All accounts unavailable");
    }

    const creds = credentials as Record<string, unknown>;
    log.info(ctx, "AUTH", `Selected account: ${creds.connectionName}`);

    const { chatCoreOpts, sourceFormat, isStreamingLocal } = await buildChatCoreOpts({
      body, provider, model, credentials: creds,
      clientRawRequest, userAgent, apiKey, request, ctx,
      requestId, startTime,
    });

    const result = await executeWithTransientRetry(
      chatCoreOpts,
      creds.connectionId as string,
      creds.connectionName as string,
      model,
      ctx
    );

    if (result.success) {
      if (isStreamingLocal) {
        if (isAlreadyWrappedStream(result.response!)) {
          return result.response!;
        }
        return wrapStreamingResponseV2(
          result.response!,
          requestId,
          provider,
          model,
          startTime,
          ctx,
          sourceFormat,
          request?.signal,
          body
        );
      }
      return result.response!;
    }

    // All attempts exhausted — lock the account
    const { shouldFallback } = await markAccountUnavailable(
      creds.connectionId as string,
      result.status,
      result.error,
      provider,
      model,
      ctx
    );

    if (shouldFallback) {
      log.warn(
        ctx,
        "AUTH",
        `Account ${creds.connectionName} unavailable (${result.status}), trying fallback`
      );
      excludeConnectionIds.add(creds.connectionId as string);
      lastError = result.error;
      lastStatus = result.status;
      continue;
    }

    appendRequestLog(requestId, `error_${result.status}`);
    const { category, suggestion } = classifyNetworkError(result.error ?? "");
    if (category !== "NETWORK_ERROR") {
      log.error(ctx, "CHAT", `[${provider}/${model}] ${category}: ${result.error}${suggestion ? ` — ${suggestion}` : ""}`);
    } else {
      log.warn(ctx, "CHAT", `[${provider}/${model}] Upstream error (${result.status}): ${result.error}`);
    }

    const isStreaming = body.stream === true;
    if (isStreaming) {
      return formatAwareErrorResponse(body, request, result.status ?? HTTP_STATUS.BAD_GATEWAY, result.error ?? "Unknown error");
    }
    return (
      result.response ??
      errorResponse(
        result.status ?? HTTP_STATUS.BAD_GATEWAY,
        result.error ?? "Unknown error"
      )
    );
  }
}
