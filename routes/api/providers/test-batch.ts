import { testProviderConnections } from "@lib/providerTest";
import { checkAdminAuth } from "@lib/authMiddleware";
import { CORS_HEADERS } from "@lib/cors";
import { register } from "@lib/routeRegistry";

export async function POST(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return Response.json(
      { error: "Invalid JSON" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const { mode, providerId } = body;

  if (!mode || typeof mode !== "string") {
    return Response.json(
      { error: "mode is required" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const validModes = ["provider", "oauth", "free", "apikey", "compatible", "all"];
  if (!validModes.includes(mode)) {
    return Response.json(
      { error: "Invalid mode. Use: provider, oauth, free, apikey, compatible, all" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  try {
    const result = await testProviderConnections(
      mode,
      typeof providerId === "string" ? providerId : undefined
    );
    return Response.json(result, { headers: CORS_HEADERS });
  } catch (error) {
    console.log("Error in batch test:", error);
    return Response.json(
      { error: "Batch test failed" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

register("/api/providers/test-batch", { POST, OPTIONS });
