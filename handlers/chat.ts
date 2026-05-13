// Port of src/sse/handlers/chat.js
// Thin orchestrator — delegates to focused modules under handlers/chat/

import { checkAuth } from "../lib/authMiddleware.ts";
import { cacheClaudeHeaders } from "../ai-bridge/utils/claudeHeaderCache.ts";
import * as log from "../lib/logger.ts";
import { RequestContext } from "../lib/requestContext.ts";
import { routeIfCombo } from "./chat/comboRouter.ts";
import { parseAndValidateRequest, type ClientRawRequest } from "./chat/bodyParser.ts";
import { runSingleModel } from "./chat/singleModelPipeline.ts";

/**
 * Handle chat completion request.
 * Supports: OpenAI, Claude, Gemini, OpenAI Responses API formats.
 *
 * This is a thin orchestrator that:
 * 1. Parses and validates the request
 * 2. Caches Claude headers
 * 3. Checks authentication
 * 4. Routes to combo model handler if applicable
 * 5. Falls through to the single-model pipeline
 */
export async function handleChat(
  request: Request,
  clientRawRequest: ClientRawRequest | null = null
): Promise<Response> {
  const ctx = RequestContext.create();

  // 1. Parse and validate request body
  const parsed = await parseAndValidateRequest(request, ctx, clientRawRequest);
  if (!parsed.ok) return parsed.response;

  const {
    body,
    modelStr,
    msgCount,
    toolCount,
    effort,
    clientRawRequest: resolvedClientRaw,
  } = parsed;
  clientRawRequest = resolvedClientRaw;

  // 2. Cache Claude headers for downstream use
  cacheClaudeHeaders(clientRawRequest.headers as Record<string, string>);

  // 3. Log request
  const url = new URL(request.url);
  const extraParts = [`model=${modelStr}`, `${msgCount} msgs`];
  if (toolCount) extraParts.push(`${toolCount} tools`);
  if (effort) extraParts.push(`effort=${effort}`);
  log.requestStart(ctx, "POST", url.pathname, extraParts.join(" | "));

  // 4. Check authentication
  const auth = await checkAuth(request, ctx);
  if (!auth.ok) return auth.response;
  const apiKey = auth.apiKey;
  const apiKeyId = auth.apiKeyId;

  // 5. Check combo routing
  const comboResult = await routeIfCombo({
    modelStr,
    body,
    ctx,
    request,
    handleSingleModel: (b, m) =>
      runSingleModel({
        body: b,
        modelStr: m,
        clientRawRequest,
        request,
        apiKey,
        apiKeyId,
        ctx,
      }),
  });
  if (comboResult) return comboResult;

  // 6. Run single-model pipeline
  return runSingleModel({
    body,
    modelStr,
    clientRawRequest,
    request,
    apiKey,
    apiKeyId,
    ctx,
    skipComboCheck: true,
  });
}
