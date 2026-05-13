import { clearAccountError } from "../../services/auth.ts";
import {
  updateProviderCredentials,
  checkAndRefreshToken,
  getProjectIdForConnection,
} from "../../services/tokenRefresh.ts";
import { detectFormatByEndpoint } from "../../ai-bridge/translator/formats.ts";
import { detectFormat } from "../../ai-bridge/handlers/provider.ts";
import { getTargetFormat } from "../../ai-bridge/handlers/provider.js";
import { sseErrorResponse, openaiSseErrorResponse } from "../../ai-bridge/utils/error.ts";
import * as log from "../../lib/logger.ts";
import { RequestContext } from "../../lib/requestContext.ts";
import { type ClientRawRequest } from "./bodyParser.ts";
import { makeUsageCallback, makeStreamErrorCallback } from "./usageRecording.ts";
import type { ChatCoreOptions } from "../../ai-bridge/handlers/chatCore.ts";

export interface BuildChatCoreOptsParams {
  body: Record<string, unknown>;
  provider: string;
  model: string;
  credentials: Record<string, unknown>;
  clientRawRequest: ClientRawRequest | null;
  userAgent: string;
  apiKey: string | null;
  request: Request | null;
  ctx: RequestContext;
  requestId: string;
  startTime: number;
}

export async function buildChatCoreOpts(params: BuildChatCoreOptsParams) {
  const {
    body,
    provider,
    model,
    credentials: creds,
    clientRawRequest,
    userAgent,
    apiKey,
    request,
    ctx,
    requestId,
    startTime,
  } = params;

  // Refresh credentials
  const refreshedCredentials = await checkAndRefreshToken(provider, creds);

  // D3: Project-ID resolution for antigravity/gemini-cli
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
      // Fire-and-forget — this is a best-effort persistence and must not
      // block the request path (can add tens of ms per call under load).
      updateProviderCredentials(creds.connectionId as string, { projectId: pid }).catch((e) => {
        log.debug(
          ctx,
          "AUTH",
          `updateProviderCredentials failed: ${e instanceof Error ? e.message : String(e)}`
        );
      });
    }
  }

  const isStreamingLocal = body.stream === true;

  // Format detection
  const endpointDetectedFormat = request?.url
    ? (detectFormatByEndpoint(new URL(request.url).pathname, body) ?? detectFormat(body))
    : detectFormat(body);
  const sourceFormat = endpointDetectedFormat;
  const targetFormat = getTargetFormat(provider);
  const isPassthrough = sourceFormat === targetFormat;
  log.formatDetect(ctx, sourceFormat, targetFormat, isStreamingLocal);
  if (isPassthrough) {
    log.passthrough(ctx, sourceFormat, targetFormat, "native lossless");
  }

  const chatCoreOpts: ChatCoreOptions = {
    ctx,
    body: { ...body, model: `${provider}/${model}` },
    modelInfo: { provider, model },
    credentials: refreshedCredentials,
    clientRawRequest: clientRawRequest ?? undefined,
    connectionId: (creds.connectionId as string) ?? undefined,
    userAgent,
    apiKey,
    sourceFormatOverride: endpointDetectedFormat,
    onCredentialsRefreshed: async (newCreds: Record<string, unknown>) => {
      await updateProviderCredentials(creds.connectionId as string, {
        accessToken: newCreds.accessToken as string,
        refreshToken: newCreds.refreshToken as string,
        providerSpecificData: newCreds.providerSpecificData as Record<string, unknown>,
        testStatus: "active",
      });
    },
    onRequestSuccess: async () => {
      await clearAccountError(creds.connectionId as string, creds, model, ctx);
    },
    onStreamError: makeStreamErrorCallback(sourceFormat, sseErrorResponse, openaiSseErrorResponse),
    onUsage: makeUsageCallback(requestId, startTime, provider, model, isStreamingLocal),
  };

  return { chatCoreOpts, sourceFormat, isStreamingLocal };
}
