// Provider-level enabled models CRUD
// This endpoint manages custom models at the provider level, independent of connections.

import { getProviderEnabledModels, updateProviderEnabledModels } from "db/index.ts";
import { checkAdminAuth } from "lib/authMiddleware.ts";
import { CORS_HEADERS } from "lib/cors.ts";
import { register } from "lib/routeRegistry.ts";

type BunRequest = Request & { params: Record<string, string> };

// GET /api/providers/:id/enabled-models
export async function GET(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  const id = (req as BunRequest).params.id ?? "";
  const models = await getProviderEnabledModels(id);

  return Response.json({ provider: id, models }, { headers: CORS_HEADERS });
}

// PUT /api/providers/:id/enabled-models
// Replace the entire enabled models list for a provider
export async function PUT(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  const id = (req as BunRequest).params.id ?? "";

  let body: { models?: unknown };
  try {
    body = await req.json() as { models?: unknown };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  if (!body.models || !Array.isArray(body.models)) {
    return Response.json({ error: "models array is required" }, { status: 400, headers: CORS_HEADERS });
  }

  const models = await updateProviderEnabledModels(id, body.models);

  return Response.json({ provider: id, models }, { headers: CORS_HEADERS });
}

// POST /api/providers/:id/enabled-models
// Add a single model to the enabled models list
export async function POST(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  const id = (req as BunRequest).params.id ?? "";

  let body: { model?: unknown };
  try {
    body = await req.json() as { model?: unknown };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  if (!body.model || typeof body.model !== "string" || !body.model.trim()) {
    return Response.json({ error: "model string is required" }, { status: 400, headers: CORS_HEADERS });
  }

  const modelId = body.model.trim();
  const currentModels = await getProviderEnabledModels(id);

  if (currentModels.includes(modelId)) {
    return Response.json(
      { error: "Model already exists in this provider" },
      { status: 409, headers: CORS_HEADERS }
    );
  }

  const models = await updateProviderEnabledModels(id, [...currentModels, modelId]);

  return Response.json({ provider: id, models }, { headers: CORS_HEADERS });
}

// DELETE /api/providers/:id/enabled-models
// Remove a single model from the enabled models list
export async function DELETE(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  const id = (req as BunRequest).params.id ?? "";

  let body: { model?: unknown };
  try {
    body = await req.json() as { model?: unknown };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  if (!body.model || typeof body.model !== "string" || !body.model.trim()) {
    return Response.json({ error: "model string is required" }, { status: 400, headers: CORS_HEADERS });
  }

  const modelId = body.model.trim();
  const currentModels = await getProviderEnabledModels(id);
  const models = currentModels.filter(m => m !== modelId);

  await updateProviderEnabledModels(id, models);

  return Response.json({ provider: id, models }, { headers: CORS_HEADERS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

register("/api/providers/:id/enabled-models", { GET, PUT, POST, DELETE, OPTIONS });
