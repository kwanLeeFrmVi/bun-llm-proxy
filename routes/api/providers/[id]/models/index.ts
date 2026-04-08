import { getModelsByProviderId, PROVIDER_ID_TO_ALIAS } from "ai-bridge/config/providerModels.ts";
import { checkAdminAuth } from "lib/authMiddleware.ts";
import { CORS_HEADERS } from "lib/cors.ts";
import { register } from "lib/routeRegistry.ts";

type BunRequest = Request & { params: Record<string, string> };

export async function GET(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  const id = (req as BunRequest).params.id ?? "";

  try {
    const models = getModelsByProviderId(id);
    const alias = (PROVIDER_ID_TO_ALIAS as Record<string, string>)[id] ?? id;

    return Response.json({
      provider: id,
      alias,
      models: models.map(m => ({
        id: `${alias}/${m.id}`,
        name: m.name,
        type: m.type,
      })),
    }, { headers: CORS_HEADERS });
  } catch (error) {
    console.log("Error fetching provider models:", error);
    return Response.json(
      { error: "Failed to fetch models" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

register("/api/providers/:id/models", { GET, OPTIONS });
