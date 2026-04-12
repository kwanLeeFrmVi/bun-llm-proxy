// GET /api/zai/usage — proxy to api.z.ai /api/monitor/usage/model-usage
import { getModelUsage } from "lib/zaiService.ts";
import { checkAdminAuth } from "lib/authMiddleware.ts";
import { register } from "lib/routeRegistry.ts";

export async function GET(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const startTime = url.searchParams.get("startTime");
  const endTime = url.searchParams.get("endTime");

  if (!startTime || !endTime) {
    return Response.json({ error: "Missing startTime or endTime parameter" }, { status: 400 });
  }

  try {
    const usage = await getModelUsage(startTime, endTime);
    return Response.json(usage);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 502 });
  }
}

register("/api/zai/usage", { GET });
