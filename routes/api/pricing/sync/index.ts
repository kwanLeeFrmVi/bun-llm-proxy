// POST /api/pricing/sync — fetch and sync OpenRouter pricing
import { syncOpenRouterPricing } from "services/pricingSync.ts";
import { withLock } from "lib/redis.ts";
import { checkAdminAuth } from "lib/authMiddleware.ts";
import { CORS_HEADERS } from "lib/cors.ts";
import { register } from "lib/routeRegistry";

export async function POST(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  // Extract OpenRouter API key from Authorization header if provided
  const authHeader = req.headers.get("Authorization") ?? "";
  const apiKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

  const result = await withLock("pricing-sync", 60, () => syncOpenRouterPricing(apiKey));

  if (!result.executed) {
    return Response.json(
      { error: "Another sync is already in progress" },
      { status: 409, headers: CORS_HEADERS }
    );
  }

  const { success, ...rest } = result.result!;

  if (!success) {
    return Response.json(
      { error: (rest as { error?: string }).error ?? "Sync failed" },
      { status: 502, headers: CORS_HEADERS }
    );
  }

  return Response.json({ success: true, ...rest }, { headers: CORS_HEADERS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

register("/api/pricing/sync", { POST, OPTIONS });
