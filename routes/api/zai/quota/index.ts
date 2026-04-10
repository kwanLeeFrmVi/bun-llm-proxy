// GET /api/zai/quota — proxy to api.z.ai /api/monitor/usage/quota/limit
import { getQuotaLimit } from "lib/zaiService.ts";
import { checkAdminAuth } from "lib/authMiddleware.ts";
import { register } from "lib/routeRegistry.ts";

export async function GET(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const quota = await getQuotaLimit();
    return Response.json(quota);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 502 });
  }
}

register("/api/zai/quota", { GET });
