import { getProviderConnections, updateProviderConnection } from "db/index.ts";
import { checkAdminAuth } from "lib/authMiddleware.ts";
import { CORS_HEADERS } from "lib/cors.ts";
import { register } from "lib/routeRegistry.ts";
import { PROVIDERS } from "ai-bridge/handlers/provider.ts";
import { getProviderAlias } from "lib/providers.ts";

type BunRequest = Request & { params: Record<string, string> };

// Providers that use x-api-key header instead of Authorization Bearer
const X_API_KEY_PROVIDERS = new Set([
  "claude", "anthropic", "glm", "glm-cn", "kimi", "kimi-coding", "minimax", "minimax-cn",
]);

function parseOpenAIStyleModels(data: unknown): Array<{ id?: string; name?: string; model?: string }> {
  if (Array.isArray(data)) return data as Array<{ id?: string; name?: string; model?: string }>;
  const d = data as Record<string, unknown>;
  return (d?.data ?? d?.models ?? d?.results ?? []) as Array<{ id?: string; name?: string; model?: string }>;
}

/**
 * Derive the /models base URL from a provider's configured chat/completions URL.
 * e.g. "https://api.groq.com/openai/v1/chat/completions" -> "https://api.groq.com/openai/v1"
 */
function deriveModelsBaseUrl(chatUrl: string): string {
  try {
    const u = new URL(chatUrl);
    // Remove the path, keep origin only — we'll append /models
    // Most providers follow the pattern: base/v1/chat/completions -> base/v1
    const path = u.pathname; // e.g. /openai/v1/chat/completions
    // Find /v1/ in the path and take everything up to and including it
    const v1Idx = path.indexOf("/v1/");
    if (v1Idx !== -1) {
      return u.origin + path.slice(0, v1Idx + 3); // up to /v1
    }
    // No /v1/ found — just return origin
    return u.origin;
  } catch {
    return "";
  }
}

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
    headers["x-api-key"] = activeConn.apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    headers.Authorization = `Bearer ${activeConn.apiKey}`;
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
  const modelIds = Array.from(
    new Set(
      rawModels
        .map(m => m?.id ?? m?.name ?? m?.model)
        .filter((id): id is string => typeof id === "string" && id.trim() !== ""),
    ),
  );

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
