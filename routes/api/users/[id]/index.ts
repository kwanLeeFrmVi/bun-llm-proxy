import { deleteUser, getUserById, getApiKeys, getUsers } from "db/index.ts";
import { checkAdminAuth } from "lib/authMiddleware.ts";
import { CORS_HEADERS } from "lib/cors.ts";
import { register } from "lib/routeRegistry";

type BunRequest = Request & { params: Record<string, string> };

// GET /api/users/:id — admin only: get user detail with their API keys
export async function GET(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;
  if (auth.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403, headers: CORS_HEADERS });
  }

  const id = (req as BunRequest).params.id ?? "";
  const user = await getUserById(id);
  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404, headers: CORS_HEADERS });
  }

  // Get all API keys to show both assigned and unassigned keys
  const allKeys = await getApiKeys();
  const assignedKeys = allKeys.filter(k => k.userId === id);
  const unassignedKeys = allKeys.filter(k => !k.userId);

  // Get all users for enrichment
  const allUsers = await getUsers();
  const userMap = new Map(allUsers.map(u => [u.id, u.username]));

  // Enrich keys with owner username
  const enrichedAssignedKeys = assignedKeys.map(k => ({
    ...k,
    ownerUsername: k.userId ? (userMap.get(k.userId) ?? null) : null,
  }));

  const enrichedUnassignedKeys = unassignedKeys.map(k => ({
    ...k,
    ownerUsername: null,
  }));

  return Response.json({
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
    },
    assignedKeys: enrichedAssignedKeys,
    unassignedKeys: enrichedUnassignedKeys,
  }, { headers: CORS_HEADERS });
}

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

register("/api/users/:id", { GET, DELETE, OPTIONS });
