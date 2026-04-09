import { getProviderConnections, updateProviderConnection } from "db/index.ts";
import { checkAdminAuth } from "lib/authMiddleware.ts";
import { CORS_HEADERS } from "lib/cors.ts";
import { register } from "lib/routeRegistry.ts";
import { PROVIDERS } from "ai-bridge/handlers/provider.ts";
import { getProviderAlias } from "lib/providers.ts";
import { X_API_KEY_PROVIDERS, ANTHROPIC_API_VERSION } from "lib/constants.ts";
import {
  parseOpenAIStyleModels,
  extractModelIds,
  deriveModelsBaseUrl,
} from "lib/utils.ts";

type BunRequest = Request & { params: Record<string, string> };

/**
 * POST /api/providers/:id/fetch-models
 *
 * Fetches the model list from a provider's remote /models endpoint
 * and persists it into providerSpecificData.enabledModels on the connection.
 *
 * Works for any provider that has a /models endpoint (OpenAI-compatible or custom).
 */
export async function POST(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  const id = (req as BunRequest).params.id ?? "";

  // Find the first active connection for this provider
  const connections = await getProviderConnections({ provider: id });
  const activeConn = connections.find(c => c.isActive !== false);

  if (!activeConn) {
    return Response.json(
      { error: "No active connection found for this provider" },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  if (!activeConn.apiKey) {
    return Response.json(
      { error: "Connection has no API key" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const apiKey = typeof activeConn.apiKey === "string" ? activeConn.apiKey : "";
  if (!apiKey) {
    return Response.json(
      { error: "Connection has no API key" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  // Determine baseUrl: prefer providerSpecificData.baseUrl, fall back to provider config
  const psd = (activeConn.providerSpecificData as Record<string, unknown> | undefined) ?? {};
  let baseUrl = typeof psd.baseUrl === "string" ? psd.baseUrl.trim().replace(/\/$/, "") : "";

  if (!baseUrl) {
    const providerConfig = PROVIDERS[id];
    if (providerConfig?.baseUrl) {
      baseUrl = deriveModelsBaseUrl(providerConfig.baseUrl);
    }
  }

  if (!baseUrl) {
    return Response.json(
      { error: "No base URL configured for this provider" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  // Build headers for the remote /models request
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  // Use x-api-key for Claude-format providers, Bearer for OpenAI-format
  if (X_API_KEY_PROVIDERS.has(id)) {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = ANTHROPIC_API_VERSION;
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  // Fetch models from the remote endpoint
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/models`, { method: "GET", headers, cache: "no-store" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Connection failed";
    return Response.json(
      { error: `Failed to reach ${baseUrl}/models: ${msg}` },
      { status: 502, headers: CORS_HEADERS },
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return Response.json(
      { error: `Remote returned ${response.status}: ${text.slice(0, 200)}` },
      { status: 502, headers: CORS_HEADERS },
    );
  }

  const data = await response.json();
  const rawModels = parseOpenAIStyleModels(data);
  const modelIds = extractModelIds(rawModels);

  if (modelIds.length === 0) {
    return Response.json(
      { error: "No models found from remote endpoint" },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  // Persist enabledModels into providerSpecificData on the connection
  const updatedPsd = { ...psd, enabledModels: modelIds };
  await updateProviderConnection(activeConn.id, {
    providerSpecificData: updatedPsd,
  });

  const prefix = (psd.prefix as string | undefined) ?? getProviderAlias(id) ?? id;

  return Response.json({
    success: true,
    provider: id,
    alias: prefix,
    count: modelIds.length,
    models: modelIds.map(modelId => ({
      id: `${prefix}/${modelId}`,
      name: modelId,
    })),
  }, { headers: CORS_HEADERS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

register("/api/providers/:id/fetch-models", { POST, OPTIONS });
