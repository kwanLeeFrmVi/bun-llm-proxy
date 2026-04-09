// GET /api/mavis/usage?range=7d — proxy to mavis.io.vn /api/usage
import { getUsage } from "../../../../../lib/mavisService.ts";
import { checkAdminAuth } from "lib/authMiddleware.ts";
import { register } from "lib/routeRegistry.ts";

export async function GET(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const range = url.searchParams.get("range") ?? "7d";

  try {
    const usage = await getUsage(range);
    return Response.json(usage);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 502 });
  }
}

register("/api/mavis/usage", { GET });
