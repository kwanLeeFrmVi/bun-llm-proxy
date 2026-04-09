import { getModelsByProviderId, PROVIDER_ID_TO_ALIAS } from "ai-bridge/config/providerModels.ts";
import { checkAdminAuth } from "lib/authMiddleware.ts";
import { CORS_HEADERS } from "lib/cors.ts";
import { register } from "lib/routeRegistry.ts";
import { isOpenAICompatibleProvider, isAnthropicCompatibleProvider } from "lib/providers.ts";
import { getProviderConnections } from "db/index.ts";

type BunRequest = Request & { params: Record<string, string> };

export async function GET(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  const id = (req as BunRequest).params.id ?? "";

  try {
    const isCompatible = isOpenAICompatibleProvider(id) || isAnthropicCompatibleProvider(id);
    const alias = (PROVIDER_ID_TO_ALIAS as Record<string, string>)[id] ?? id;

    // For compatible providers, try fetching models from the remote endpoint
    if (isCompatible) {
      const connections = await getProviderConnections({ provider: id });
      const activeConn = connections.find(c => c.isActive !== false);
      const psd = (activeConn?.providerSpecificData as Record<string, unknown> | undefined) ?? {};
      const baseUrl = typeof psd.baseUrl === "string" ? psd.baseUrl.trim().replace(/\/$/, "") : "";

      if (baseUrl && activeConn?.apiKey) {
        const headers: Record<string, string> = { "Content-Type": "application/json" };

        if (isOpenAICompatibleProvider(id)) {
          headers.Authorization = `Bearer ${activeConn.apiKey}`;
        } else {
          headers["x-api-key"] = activeConn.apiKey;
          headers["anthropic-version"] = "2023-06-01";
          headers.Authorization = `Bearer ${activeConn.apiKey}`;
        }

        try {
          const response = await fetch(`${baseUrl}/models`, { method: "GET", headers, cache: "no-store" });
          if (response.ok) {
            const data = await response.json();
            const rawModels = Array.isArray(data)
              ? data
              : ((data as Record<string, unknown>)?.data ?? (data as Record<string, unknown>)?.models ?? []);

            const prefix = (psd.prefix as string | undefined) ?? alias;
            const models = (rawModels as Array<{ id?: string; name?: string; model?: string }>)
              .map(m => {
                const modelId = m?.id ?? m?.name ?? m?.model ?? "";
                return modelId ? {
                  id: `${prefix}/${modelId}`,
                  name: m?.name ?? m?.id,
                  type: undefined,
                } : null;
              })
              .filter((m): m is NonNullable<typeof m> => m !== null);

            return Response.json({ provider: id, alias: prefix, models }, { headers: CORS_HEADERS });
          }
        } catch {
          // Fetch failed, fall through to static models (which will be empty for compat providers)
        }
      }
    }

    // Fallback: return static/predefined models
    const models = getModelsByProviderId(id);

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
