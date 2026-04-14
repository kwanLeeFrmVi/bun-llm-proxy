// GET /api/usage/model-stats — per-model stats with time range
import { getModelStats } from "@/lib/usageDb";
import { checkAdminAuth } from "lib/authMiddleware.ts";
import { CORS_HEADERS } from "lib/cors.ts";
import { register } from "lib/routeRegistry";

export async function GET(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const model = url.searchParams.get("model");
  const period = url.searchParams.get("period") ?? "7d";
  const page = parseInt(url.searchParams.get("page") ?? "1");
  const limit = parseInt(url.searchParams.get("limit") ?? "50");

  if (!model) {
    return Response.json({ error: "Missing model parameter" }, { status: 400, headers: CORS_HEADERS });
  }

  const result = getModelStats(model, period, { page, limit });
  return Response.json(result, { headers: CORS_HEADERS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

register("/api/usage/model-stats", { GET, OPTIONS });
