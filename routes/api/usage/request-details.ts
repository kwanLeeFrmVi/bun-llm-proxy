// GET /api/usage/request-details — paginated request log with filters
import { getUsageDetails } from "@/lib/usageDb";
import { checkAdminAuth } from "lib/authMiddleware.ts";
import { CORS_HEADERS } from "lib/cors.ts";
import { register } from "lib/routeRegistry";

export async function GET(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const p = url.searchParams;

  const result = getUsageDetails({
    limit: parseInt(p.get("limit") ?? "20"),
    offset: parseInt(p.get("offset") ?? "0"),
    provider: p.get("provider") ?? undefined,
    model: p.get("model") ?? undefined,
    apiKeyId: p.get("apiKeyId") ?? undefined,
    startDate: p.get("startDate") ?? undefined,
    endDate: p.get("endDate") ?? undefined,
    period: p.get("period") ?? undefined,
  });

  return Response.json(result, { headers: CORS_HEADERS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

register("/api/usage/request-details", { GET, OPTIONS });
