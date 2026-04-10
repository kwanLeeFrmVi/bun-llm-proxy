// GET /api/pricing — return current pricing data from pricing table
import { getPricing } from "db/index.ts";
import { checkAdminAuth } from "lib/authMiddleware.ts";
import { CORS_HEADERS } from "lib/cors.ts";
import { register } from "lib/routeRegistry";

export async function GET(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  const pricing = await getPricing();
  return Response.json(pricing, { headers: CORS_HEADERS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

register("/api/pricing", { GET, OPTIONS });