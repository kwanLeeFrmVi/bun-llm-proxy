// GET /api/usage/leaderboard — per-user token usage leaderboard
import { getLeaderboard } from "@/lib/usageDb";
import { checkAdminAuth } from "lib/authMiddleware.ts";
import { CORS_HEADERS } from "lib/cors.ts";
import { register } from "lib/routeRegistry";

export async function GET(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const period = url.searchParams.get("period") ?? "24h";
  const leaderboard = getLeaderboard(period);

  return Response.json({ leaderboard }, { headers: CORS_HEADERS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

register("/api/usage/leaderboard", { GET, OPTIONS });
