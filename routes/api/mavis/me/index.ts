// GET /api/mavis/me — proxy to mavis.io.vn /propilot/auth/me
import { getMe } from "lib/mavisService.ts";
import { checkAdminAuth } from "lib/authMiddleware.ts";
import { register } from "lib/routeRegistry.ts";

export async function GET(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const me = await getMe();
    return Response.json(me);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 502 });
  }
}

register("/api/mavis/me", { GET });
