// GET /api/usage/models-latest-stats — latest streaming stats per model
import { getModelsLatestStats } from "@/lib/usageDb";
import { checkAdminAuth } from "lib/authMiddleware.ts";
import { CORS_HEADERS } from "lib/cors.ts";
import { register } from "lib/routeRegistry";

export async function GET(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  const stats = getModelsLatestStats();
  return Response.json({ stats }, { headers: CORS_HEADERS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

register("/api/usage/models-latest-stats", { GET, OPTIONS });
