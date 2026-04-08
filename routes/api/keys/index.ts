import { createApiKey, getApiKeys, getUsers } from "db/index.ts";
import { checkAdminAuth } from "lib/authMiddleware.ts";
import { CORS_HEADERS } from "lib/cors.ts";
import { register } from "lib/routeRegistry";

// GET /api/keys
// - Admin: returns all keys (with owner username)
// - User:  returns only their own assigned keys
export async function GET(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  if (auth.role === "admin") {
    const keys = await getApiKeys();
    // Enrich with username for admin view
    const users = await getUsers();
    const userMap = new Map(users.map(u => [u.id, u.username]));
    const enriched = keys.map(k => ({
      ...k,
      ownerUsername: k.userId ? (userMap.get(k.userId) ?? null) : null,
    }));
    return Response.json({ keys: enriched }, { headers: CORS_HEADERS });
  }

  // Base user: only see their own keys
  const keys = await getApiKeys({ userId: auth.userId });
  return Response.json({ keys }, { headers: CORS_HEADERS });
}

// POST /api/keys
// - Admin: can create key and assign to any user_id
// - User:  creates key assigned to themselves
export async function POST(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json(
      { error: "Invalid JSON" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const name = body.name as string | undefined;
  if (!name)
    return Response.json(
      { error: "Missing required field: name" },
      { status: 400, headers: CORS_HEADERS },
    );

  // Admin can pass an explicit userId; base users always get their own
  const userId =
    auth.role === "admin"
      ? ((body.userId as string | undefined) ?? null)
      : auth.userId;

  const apiKey = await createApiKey(name, undefined, userId);
  return Response.json(apiKey, { status: 201, headers: CORS_HEADERS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

register("/api/keys", { GET, POST, OPTIONS });
