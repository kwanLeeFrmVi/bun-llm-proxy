import {
  getCombos,
  getComboByName,
  createCombo,
  setComboConfig,
  getComboConfig,
  deleteComboConfig,
  getSettings,
  updateSetting,
} from "@/lib/localDb";
import { checkComboCycle } from "@/services/model";
import { checkAdminAuth } from "lib/authMiddleware.ts";
import { CORS_HEADERS } from "lib/cors.ts";
import { register } from "lib/routeRegistry";

const NAME_REGEX = /^[a-zA-Z0-9_.\-]+$/;

interface ComboModelInput {
  model: string;
  weight?: number;
}
type ComboModelsInput = (string | ComboModelInput)[];

function normalizeModels(raw: ComboModelsInput | undefined): string[] {
  if (!raw) return [];
  return raw.map((item): string => {
    if (typeof item === "string") return item;
    return item.model;
  });
}

function normalizeComboConfig(
  raw: ComboModelsInput | undefined
): import("../../../db/index.ts").ComboConfig["models"] | null {
  if (!raw || raw.length === 0) return null;
  // If all strings, no extended config needed
  if (raw.every((item) => typeof item === "string")) return null;
  return raw.map((item) => {
    if (typeof item === "string") return { model: item, weight: 1 };
    return { model: item.model, weight: Math.round(item.weight ?? 1) };
  });
}

export async function GET(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;
  const combos = await getCombos();

  // Fetch settings to get combo strategies
  const settings = await getSettings();
  const comboStrategies = (settings.comboStrategies as Record<string, any>) || {};

  // Fetch combo configs for all combos to get weights, while preserving the order from combos table
  const combosWithWeights = await Promise.all(
    combos.map(async (combo) => {
      const config = await getComboConfig(combo.name);
      // Always use combo.models as the source of truth for order
      const models = combo.models.map((modelId) => {
        const configItem = config?.models.find((m) => m.model === modelId);
        return {
          model: modelId,
          weight: configItem ? configItem.weight : 1,
        };
      });

      const strategy = comboStrategies[combo.name]?.fallbackStrategy || "fallback";

      return {
        ...combo,
        models,
        strategy,
      };
    })
  );

  return Response.json({ combos: combosWithWeights }, { headers: CORS_HEADERS });
}

export async function POST(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  const name = body.name as string | undefined;
  const rawModels = body.models as ComboModelsInput | undefined;
  const strategy = body.strategy as string | undefined;

  if (!name || !NAME_REGEX.test(name))
    return Response.json(
      { error: "Invalid name — use letters, numbers, _ . -" },
      { status: 400, headers: CORS_HEADERS }
    );
  if (await getComboByName(name))
    return Response.json({ error: "Name already exists" }, { status: 400, headers: CORS_HEADERS });
  if (!rawModels || rawModels.length === 0)
    return Response.json(
      { error: "At least one model is required" },
      { status: 400, headers: CORS_HEADERS }
    );

  const models = normalizeModels(rawModels);

  if (await checkComboCycle(name, models)) {
    return Response.json(
      { error: "Cycle detected — a combo cannot include itself directly or indirectly" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const combo = await createCombo({ name, models });

  // Save combo config with weights
  const configModels = normalizeComboConfig(rawModels);
  if (configModels) {
    await setComboConfig(name, { name, models: configModels });
  } else {
    // Clear any stale config if this name was used before
    await deleteComboConfig(name);
  }

  // Update strategy in settings if provided
  if (strategy !== undefined) {
    const settings = await getSettings();
    const comboStrategies = { ...((settings.comboStrategies as Record<string, any>) || {}) };
    comboStrategies[name] = {
      ...comboStrategies[name],
      fallbackStrategy: strategy,
    };
    await updateSetting("comboStrategies", comboStrategies);
  }

  // Return combo with models (including weights)
  return Response.json(
    { ...combo, models: configModels ?? models.map((m) => ({ model: m, weight: 1 })), strategy: strategy || "fallback" },
    { status: 201, headers: CORS_HEADERS }
  );
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

register("/api/combos", { GET, POST, OPTIONS });
