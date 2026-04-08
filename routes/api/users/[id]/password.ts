import { getUserById, updateUserPassword } from "db/index.ts";
import { checkAdminAuth } from "lib/authMiddleware.ts";
import { CORS_HEADERS } from "lib/cors.ts";
import { register } from "lib/routeRegistry";

type BunRequest = Request & { params: Record<string, string> };

// PUT /api/users/:id/password
// - Admin can change any user's password
// - Base user can only change their own password
export async function PUT(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  const targetId = (req as BunRequest).params.id ?? "";

  // Base users may only change their own password
  if (auth.role !== "admin" && auth.userId !== targetId) {
    return Response.json({ error: "Forbidden" }, { status: 403, headers: CORS_HEADERS });
  }

  const target = await getUserById(targetId);
  if (!target) {
    return Response.json({ error: "User not found" }, { status: 404, headers: CORS_HEADERS });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  const newPassword = body.password as string | undefined;
  if (!newPassword || newPassword.length < 6) {
    return Response.json(
      { error: "Password must be at least 6 characters" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const newHash = await Bun.password.hash(newPassword);
  await updateUserPassword(targetId, newHash);

  return Response.json({ success: true }, { headers: CORS_HEADERS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

register("/api/users/:id/password", { PUT, OPTIONS });
