import { getModelsByProviderId, PROVIDER_ID_TO_ALIAS } from "ai-bridge/config/providerModels.ts";
import { checkAdminAuth } from "lib/authMiddleware.ts";
import { CORS_HEADERS } from "lib/cors.ts";
import { register } from "lib/routeRegistry.ts";
import { isOpenAICompatibleProvider, isAnthropicCompatibleProvider } from "lib/providers.ts";
import { getProviderConnections, getProviderEnabledModels, getProviderNodeById } from "db/index.ts";
import { ANTHROPIC_API_VERSION } from "lib/constants.ts";

type BunRequest = Request & { params: Record<string, string> };

type ProviderModelResponse = {
  id: string;
  name?: string;
  type?: string;
};

function normalizeModelId(modelId: string, prefixes: string[]): string {
  const trimmedModelId = modelId.trim();
  for (const prefix of prefixes) {
    if (trimmedModelId.startsWith(`${prefix}/`)) {
      return trimmedModelId.slice(prefix.length + 1);
    }
  }
  return trimmedModelId;
}

function mergeModels(
  baseModels: ProviderModelResponse[],
  enabledModels: unknown,
  outputAlias: string,
  providerId: string,
  fallbackAlias: string
): ProviderModelResponse[] {
  const prefixes = [outputAlias, fallbackAlias, providerId].filter(
    (prefix, index, allPrefixes) => prefix && allPrefixes.indexOf(prefix) === index
  );
  const mergedModels = new Map<string, ProviderModelResponse>();

  for (const model of baseModels) {
    const rawModelId = normalizeModelId(model.id, prefixes);
    if (!rawModelId) continue;
    mergedModels.set(rawModelId, {
      id: `${outputAlias}/${rawModelId}`,
      name: model.name,
      type: model.type,
    });
  }

  if (Array.isArray(enabledModels)) {
    for (const enabledModel of enabledModels) {
      if (typeof enabledModel !== "string") continue;
      const rawModelId = normalizeModelId(enabledModel, prefixes);
      if (!rawModelId) continue;
      if (!mergedModels.has(rawModelId)) {
        mergedModels.set(rawModelId, {
          id: `${outputAlias}/${rawModelId}`,
          name: rawModelId,
          type: undefined,
        });
      }
    }
  }

  return Array.from(mergedModels.values());
}

export async function GET(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  const id = (req as BunRequest).params.id ?? "";

  try {
    const isCompatible = isOpenAICompatibleProvider(id) || isAnthropicCompatibleProvider(id);
    const alias = (PROVIDER_ID_TO_ALIAS as Record<string, string>)[id] ?? id;
    const connections = await getProviderConnections({ provider: id });
    const activeConn = connections.find((c) => c.isActive !== false);
    const psd = (activeConn?.providerSpecificData as Record<string, unknown> | undefined) ?? {};

    // Determine output alias: prefer provider node prefix, then connection prefix, then alias
    let outputAlias = alias;
    let providerName = id; // Default to using id as the provider name
    if (isCompatible) {
      const node = await getProviderNodeById(id);
      if (node?.prefix) {
        outputAlias = node.prefix;
      }
      if (node?.name) {
        providerName = node.name;
      }
    }
    if (typeof psd.prefix === "string" && psd.prefix.trim()) {
      outputAlias = psd.prefix.trim();
    }

    // Get enabled models from provider-level storage using the provider's name
    const enabledModels = await getProviderEnabledModels(providerName);

    // For compatible providers, try fetching models from the remote endpoint
    if (isCompatible) {
      const baseUrl = typeof psd.baseUrl === "string" ? psd.baseUrl.trim().replace(/\/$/, "") : "";
      const apiKey = typeof activeConn?.apiKey === "string" ? activeConn.apiKey : "";

      if (baseUrl && apiKey) {
        const headers: Record<string, string> = { "Content-Type": "application/json" };

        if (isOpenAICompatibleProvider(id)) {
          headers.Authorization = `Bearer ${apiKey}`;
        } else {
          headers["x-api-key"] = apiKey;
          headers["anthropic-version"] = ANTHROPIC_API_VERSION;
          headers.Authorization = `Bearer ${apiKey}`;
        }

        try {
          const response = await fetch(`${baseUrl}/models`, {
            method: "GET",
            headers,
            cache: "no-store",
          });
          if (response.ok) {
            const data = await response.json();
            const rawModels = Array.isArray(data)
              ? data
              : ((data as Record<string, unknown>)?.data ??
                (data as Record<string, unknown>)?.models ??
                []);

            const remoteModels = (
              rawModels as Array<{ id?: string; name?: string; model?: string }>
            )
              .map((m) => {
                const modelId = m?.id ?? m?.name ?? m?.model ?? "";
                return modelId
                  ? {
                      id: `${outputAlias}/${modelId}`,
                      name: m?.name ?? m?.id,
                      type: undefined,
                    }
                  : null;
              })
              .filter((m): m is NonNullable<typeof m> => m !== null);

            const models = mergeModels(remoteModels, enabledModels, outputAlias, id, alias);

            return Response.json(
              { provider: id, alias: outputAlias, models },
              { headers: CORS_HEADERS }
            );
          }
        } catch {
          // Fetch failed, fall through to static models (which will be empty for compat providers)
        }
      }
    }

    // Fallback: return static/predefined models
    const models = mergeModels(
      getModelsByProviderId(id).map((m) => ({
        id: `${outputAlias}/${m.id}`,
        name: m.name,
        type: m.type,
      })),
      enabledModels,
      outputAlias,
      id,
      alias
    );

    return Response.json(
      {
        provider: id,
        alias: outputAlias,
        models,
      },
      { headers: CORS_HEADERS }
    );
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
