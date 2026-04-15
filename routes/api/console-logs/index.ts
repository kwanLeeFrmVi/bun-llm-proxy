// GET /api/console-logs — return current console log buffer
// DELETE /api/console-logs — clear console log buffer
import { getConsoleLogs, clearConsoleLogs } from "lib/consoleLogBuffer.ts";
import { checkAdminAuth } from "lib/authMiddleware.ts";
import { CORS_HEADERS } from "lib/cors.ts";
import { register } from "lib/routeRegistry";

export async function GET(_req: Request): Promise<Response> {
  const auth = await checkAdminAuth(_req);
  if (!auth.ok) return auth.response;

  return Response.json(getConsoleLogs(), { headers: CORS_HEADERS });
}

export async function DELETE(_req: Request): Promise<Response> {
  const auth = await checkAdminAuth(_req);
  if (!auth.ok) return auth.response;

  clearConsoleLogs();
  return Response.json({ success: true }, { headers: CORS_HEADERS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

register("/api/console-logs", { GET, DELETE, OPTIONS });
