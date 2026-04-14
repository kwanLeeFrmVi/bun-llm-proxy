import { checkAdminAuth } from "lib/authMiddleware.ts";
import {
  deleteCombo,
  getComboById,
  getComboByName,
  updateCombo,
  setComboConfig,
  getComboConfig,
  deleteComboConfig,
} from "@/lib/localDb";
import { checkComboCycle } from "@/services/model";
import { CORS_HEADERS } from "lib/cors.ts";
import { register } from "lib/routeRegistry";

type BunRequest = Request & { params: Record<string, string> };
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
): import("../../../../db/index.ts").ComboConfig["models"] | null {
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
  const id = (req as BunRequest).params.id ?? "";
  const combo = await getComboById(id);
  if (!combo) return Response.json({ error: "Not found" }, { status: 404, headers: CORS_HEADERS });

  // Get weights from combo_configs while preserving order from combos table
  const config = await getComboConfig(combo.name);
  // Always use combo.models as the source of truth for order
  const models = combo.models.map((modelId) => {
    const configItem = config?.models.find((m) => m.model === modelId);
    return {
      model: modelId,
      weight: configItem ? configItem.weight : 1,
    };
  });

  return Response.json({ ...combo, models }, { headers: CORS_HEADERS });
}

export async function PUT(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  const id = (req as BunRequest).params.id ?? "";
  const combo = await getComboById(id);
  if (!combo) return Response.json({ error: "Not found" }, { status: 404, headers: CORS_HEADERS });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  const name = body.name as string | undefined;
  const rawModels = body.models as ComboModelsInput | undefined;

  if (name !== undefined) {
    if (!NAME_REGEX.test(name))
      return Response.json(
        { error: "Invalid name — use letters, numbers, _ . -" },
        { status: 400, headers: CORS_HEADERS }
      );
    const existing = await getComboByName(name);
    if (existing && existing.id !== id)
      return Response.json(
        { error: "Name already exists" },
        { status: 400, headers: CORS_HEADERS }
      );
  }

  const models = rawModels !== undefined ? normalizeModels(rawModels) : combo.models;

  // Check for cycles if models or name changed
  if (name !== undefined || rawModels !== undefined) {
    const targetName = name ?? combo.name;
    if (await checkComboCycle(targetName, models)) {
      return Response.json(
        { error: "Cycle detected — a combo cannot include itself directly or indirectly" },
        { status: 400, headers: CORS_HEADERS }
      );
    }
  }

  const updated = await updateCombo(id, {
    ...(name !== undefined && { name }),
    ...(rawModels !== undefined && { models: models }),
  });

  // Update combo config if name or models changed
  if (name !== undefined || rawModels !== undefined) {
    const targetName = name ?? combo.name;
    const config = await getComboConfig(combo.name);

    if (rawModels !== undefined) {
      // New models provided: normalize and save
      const configModels = normalizeComboConfig(rawModels);
      if (configModels) {
        await setComboConfig(targetName, { name: targetName, models: configModels });
      } else {
        await deleteComboConfig(targetName);
      }
    } else if (name !== undefined && name !== combo.name && config) {
      // Only name changed: migrate existing config if it exists
      await setComboConfig(name, { ...config, name });
    }

    // If name changed, delete config under old name
    if (name && name !== combo.name) {
      await deleteComboConfig(combo.name);
    }
  }

  // Fetch the final state to return to the client with weights and correct order
  const finalCombo = await getComboById(id);
  if (!finalCombo) {
    return Response.json({ error: "Failed to retrieve updated combo" }, { status: 500, headers: CORS_HEADERS });
  }

  const finalConfig = await getComboConfig(finalCombo.name);
  const finalModels = finalCombo.models.map((modelId) => {
    const configItem = finalConfig?.models.find((m) => m.model === modelId);
    return {
      model: modelId,
      weight: configItem ? configItem.weight : 1,
    };
  });

  return Response.json({ ...finalCombo, models: finalModels }, { headers: CORS_HEADERS });
}

export async function DELETE(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;
  const id = (req as BunRequest).params.id ?? "";
  const combo = await getComboById(id);
  if (!combo) return Response.json({ error: "Not found" }, { status: 404, headers: CORS_HEADERS });
  await deleteCombo(id);
  return Response.json({ success: true }, { headers: CORS_HEADERS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

register("/api/combos/:id", { GET, PUT, DELETE, OPTIONS });
