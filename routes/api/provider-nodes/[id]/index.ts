import { getProviderNodeById, updateProviderNode, deleteProviderNode } from "@/lib/localDb";
import { checkAdminAuth } from "lib/authMiddleware.ts";
import { CORS_HEADERS } from "lib/cors.ts";
import { register } from "lib/routeRegistry";
import { asObjectRecord } from "lib/utils.ts";

type BunRequest = Request & { params: Record<string, string> };

// GET /api/provider-nodes/:id
export async function GET(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;
  const id = (req as BunRequest).params.id ?? "";
  const node = await getProviderNodeById(id);
  if (!node) return Response.json({ error: "Not found" }, { status: 404, headers: CORS_HEADERS });
  return Response.json({ node }, { headers: CORS_HEADERS });
}

// PUT /api/provider-nodes/:id
export async function PUT(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  const id = (req as BunRequest).params.id ?? "";
  const body = asObjectRecord(await req.json().catch(() => null)) ?? {};

  const node = await updateProviderNode(id, body);
  if (!node) return Response.json({ error: "Not found" }, { status: 404, headers: CORS_HEADERS });
  return Response.json({ node }, { headers: CORS_HEADERS });
}

// DELETE /api/provider-nodes/:id
export async function DELETE(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  const id = (req as BunRequest).params.id ?? "";
  const deleted = await deleteProviderNode(id);
  if (!deleted) return Response.json({ error: "Not found" }, { status: 404, headers: CORS_HEADERS });
  return Response.json({ success: true }, { headers: CORS_HEADERS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

register("/api/provider-nodes/:id", { GET, PUT, DELETE, OPTIONS });
