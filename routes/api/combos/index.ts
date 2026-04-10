import { getCombos, getComboByName, createCombo, setComboConfig, getComboConfig } from "@/lib/localDb";
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

function normalizeComboConfig(raw: ComboModelsInput | undefined): import("../../../db/index.ts").ComboConfig["models"] | null {
  if (!raw || raw.length === 0) return null;
  // If all strings, no extended config needed
  if (raw.every(item => typeof item === "string")) return null;
  return raw.map(item => {
    if (typeof item === "string") return { model: item, weight: 1 };
    return { model: item.model, weight: Math.round(item.weight ?? 1) };
  });
}

export async function GET(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;
  const combos = await getCombos();
  return Response.json({ combos }, { headers: CORS_HEADERS });
}

export async function POST(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  const name = body.name as string | undefined;
  const rawModels = body.models as ComboModelsInput | undefined;

  if (!name || !NAME_REGEX.test(name))
    return Response.json({ error: "Invalid name — use letters, numbers, _ . -" }, { status: 400, headers: CORS_HEADERS });
  if (await getComboByName(name))
    return Response.json({ error: "Name already exists" }, { status: 400, headers: CORS_HEADERS });
  if (!rawModels || rawModels.length === 0)
    return Response.json({ error: "At least one model is required" }, { status: 400, headers: CORS_HEADERS });

  const models = normalizeModels(rawModels);
  const combo = await createCombo({ name, models });

  const configModels = normalizeComboConfig(rawModels);
  if (configModels) {
    await setComboConfig(name, { name, models: configModels });
  }

  return Response.json(combo, { status: 201, headers: CORS_HEADERS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

register("/api/combos", { GET, POST, OPTIONS });
