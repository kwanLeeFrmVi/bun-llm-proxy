import { getUsers, createUser } from "@/lib/localDb";
import { checkAdminAuth } from "lib/authMiddleware.ts";
import { CORS_HEADERS } from "lib/cors.ts";
import { register } from "lib/routeRegistry";

// GET /api/users — admin only: list all users
export async function GET(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;
  if (auth.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403, headers: CORS_HEADERS });
  }

  const users = await getUsers();
  return Response.json({ users }, { headers: CORS_HEADERS });
}

// POST /api/users — admin only: create a new user
export async function POST(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;
  if (auth.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403, headers: CORS_HEADERS });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  const username = body.username as string | undefined;
  const password = body.password as string | undefined;
  const role = (body.role as string | undefined) === "user" ? "user" : "admin";

  if (!username || !password) {
    return Response.json(
      { error: "Missing required fields: username, password" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  try {
    const hash = await Bun.password.hash(password);
    const user = await createUser(username, hash, role);
    return Response.json(
      { id: user.id, username: user.username, role: user.role, createdAt: user.createdAt },
      { status: 201, headers: CORS_HEADERS }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE")) {
      return Response.json(
        { error: "Username already exists" },
        { status: 409, headers: CORS_HEADERS }
      );
    }
    return Response.json(
      { error: "Failed to create user" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

register("/api/users", { GET, POST, OPTIONS });
