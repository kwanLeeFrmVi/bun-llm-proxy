import {
  getProviderConnectionById,
  updateProviderConnection,
} from "@/lib/localDb";
import { checkAdminAuth } from "lib/authMiddleware.ts";
import { CORS_HEADERS } from "lib/cors.ts";
import { register } from "lib/routeRegistry.ts";

type BunRequest = Request & { params: Record<string, string> };

export async function POST(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  const id = (req as BunRequest).params.id ?? "";
  const connection = await getProviderConnectionById(id);
  if (!connection)
    return Response.json({ error: "Not found" }, { status: 404, headers: CORS_HEADERS });

  const update: Record<string, unknown> = {};

  // Clear all modelLock_* from providerSpecificData
  for (const key of Object.keys(connection.providerSpecificData ?? {})) {
    if (key.startsWith("modelLock_")) update[key] = null;
  }

  // Also clear flattened keys on the connection object
  for (const key of Object.keys(connection)) {
    if (key.startsWith("modelLock_")) update[key] = null;
  }

  // Reset error state
  update.testStatus = "active";
  update.lastError = null;
  update.errorCode = null;
  update.lastErrorAt = null;
  update.backoffLevel = 0;

  const updated = await updateProviderConnection(id, update);
  return Response.json({ success: true, connection: updated }, { headers: CORS_HEADERS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

register("/api/providers/:id/clear-locks", { POST, OPTIONS });
