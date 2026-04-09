// POST /api/mavis/refresh — force re-login to mavis.io.vn
import { refreshSession } from "lib/mavisService.ts";
import { checkAdminAuth } from "lib/authMiddleware.ts";
import { register } from "lib/routeRegistry.ts";

export async function POST(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  try {
    await refreshSession();
    return Response.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 502 });
  }
}

register("/api/mavis/refresh", { POST });
