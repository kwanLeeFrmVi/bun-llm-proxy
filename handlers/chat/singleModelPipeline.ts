import { getModelInfo } from "../../services/model.ts";
import { trackPendingRequest } from "../../stubs/usageDb.ts";
import * as log from "../../lib/logger.ts";
import { RequestContext } from "../../lib/requestContext.ts";
import { HTTP_STATUS } from "../../ai-bridge/config/runtimeConfig.ts";
import { routeIfCombo } from "./comboRouter.ts";
import { formatAwareErrorResponse } from "./errorShaping.ts";
import { executeWithAccountFallback } from "./accountFallbackLoop.ts";
import { type ClientRawRequest } from "./bodyParser.ts";

export interface SingleModelPipelineOpts {
  body: Record<string, unknown>;
  modelStr: string;
  clientRawRequest: ClientRawRequest | null;
  request: Request | null;
  apiKey: string | null;
  apiKeyId: string | null;
  ctx: RequestContext;
  /** Skip combo re-check (caller already verified this isn't a combo alias). */
  skipComboCheck?: boolean;
}

/**
 * Run the single-model pipeline:
 * 1. Resolve model info
 * 2. Re-check combo routing (model might be a combo alias)
 * 3. Execute with account fallback
 */
export async function runSingleModel(opts: SingleModelPipelineOpts): Promise<Response> {
  const { body, modelStr, clientRawRequest, request, apiKey, apiKeyId, ctx, skipComboCheck } = opts;

  const modelInfo = await getModelInfo(modelStr);

  if (!modelInfo.provider) {
    if (skipComboCheck) {
      log.warn(ctx, "CHAT", "Invalid model format", { model: modelStr });
      return formatAwareErrorResponse(body, request, HTTP_STATUS.BAD_REQUEST, "Invalid model format");
    }

    // Re-check combo routing (model might be a combo alias that wasn't caught earlier).
    // Do NOT pass skipComboCheck here: if the selected inner model is itself a
    // combo alias (combo-of-combo), the nested call must be allowed to recurse.
    const comboResult = await routeIfCombo({
      modelStr,
      body,
      ctx,
      request,
      handleSingleModel: (b, m) => runSingleModel({
        body: b, modelStr: m, clientRawRequest, request, apiKey, apiKeyId, ctx,
      }),
    });
    if (comboResult) return comboResult;

    log.warn(ctx, "CHAT", "Invalid model format", { model: modelStr });
    return formatAwareErrorResponse(body, request, HTTP_STATUS.BAD_REQUEST, "Invalid model format");
  }

  const { provider, model } = modelInfo as { provider: string; model: string };

  if (modelStr !== `${provider}/${model}`) {
    log.info(ctx, "ROUTING", `${modelStr} → ${provider}/${model}`);
  } else {
    log.info(ctx, "ROUTING", `Provider: ${provider}, Model: ${model}`);
  }

  const requestId = `${ctx.id}-${crypto.randomUUID().slice(0, 8)}`;
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

  return executeWithAccountFallback({
    body, provider, model, clientRawRequest, request, apiKey, apiKeyId,
    ctx, requestId, startTime, userAgent,
  });
}
