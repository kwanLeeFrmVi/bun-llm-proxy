// GET /api/usage/user-stats?userId=X&period=Y — per-user usage breakdown by model
import { getUserUsageByModel } from "@/lib/usageDb";
import { checkAdminAuth } from "lib/authMiddleware.ts";
import { CORS_HEADERS } from "lib/cors.ts";
import { register } from "lib/routeRegistry";

export async function GET(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") ?? "";
  const period = url.searchParams.get("period") ?? "24h";

  if (!userId) {
    return Response.json({ error: "userId required" }, { status: 400, headers: CORS_HEADERS });
  }

  const byModel = getUserUsageByModel(userId, period);
  return Response.json({ byModel }, { headers: CORS_HEADERS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

register("/api/usage/user-stats", { GET, OPTIONS });
