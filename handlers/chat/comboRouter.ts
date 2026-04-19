import { getFilteredComboModelConfigs } from "../../services/model.ts";
import { getSettings, getAverageTTFT } from "../../db/index.ts";
import { handleComboModel } from "../../services/comboRouting.ts";
import * as log from "../../lib/logger.ts";
import { RequestContext } from "../../lib/requestContext.ts";

export type HandleSingleModelFn = (
  body: Record<string, unknown>,
  modelStr: string
) => Promise<Response>;

export interface RouteIfComboOpts {
  modelStr: string;
  body: Record<string, unknown>;
  ctx: RequestContext;
  request: Request | null;
  handleSingleModel: HandleSingleModelFn;
}

// Wrapper for handleComboModel that injects getAverageTTFT
async function handleComboModelWithDB(
  opts: Parameters<typeof handleComboModel>[0] & { ctx: RequestContext }
): Promise<Response> {
  return handleComboModel({
    ...opts,
    getAverageTTFT,
  });
}

/**
 * Check if the model is a combo model and route accordingly.
 * Returns the combo Response if routed, or null if not a combo.
 */
export async function routeIfCombo(opts: RouteIfComboOpts): Promise<Response | null> {
  const { modelStr, body, ctx, request, handleSingleModel } = opts;

  const comboModels = await getFilteredComboModelConfigs(modelStr);
  if (!comboModels) return null;

  const settings = await getSettings();
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
  const sessionId = request?.headers?.get("x-claude-code-session-id") ?? null;
  return handleComboModelWithDB({
    ctx,
    body,
    models: comboModels,
    handleSingleModel: async (b: Record<string, unknown>, m: string) => {
      const resp = await handleSingleModel(b, m);
      if (resp.ok && !resp.headers.get("X-Proxy-Error")) {
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
