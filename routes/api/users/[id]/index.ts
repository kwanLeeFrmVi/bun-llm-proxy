import { deleteUser } from "db/index.ts";
import { checkAdminAuth } from "lib/authMiddleware.ts";
import { CORS_HEADERS } from "lib/cors.ts";
import { register } from "lib/routeRegistry";

type BunRequest = Request & { params: Record<string, string> };

export async function DELETE(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;
  if (auth.role !== "admin") {
    return new Response("Forbidden", { status: 403, headers: CORS_HEADERS });
  }

  const id = (req as BunRequest).params.id;
  if (!id) return new Response("Missing ID", { status: 400, headers: CORS_HEADERS });

  const success = await deleteUser(id);
  if (!success) {
    return new Response("User not found", { status: 404, headers: CORS_HEADERS });
  }

  return Response.json({ success: true }, { headers: CORS_HEADERS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

register("/api/users/:id", { DELETE, OPTIONS });
