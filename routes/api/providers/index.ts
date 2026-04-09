import { getProviderConnections, createProviderConnection } from "@/lib/localDb";
import { checkAdminAuth } from "lib/authMiddleware.ts";
import { CORS_HEADERS } from "lib/cors.ts";
import { register } from "lib/routeRegistry";
import {
  FREE_PROVIDERS,
  FREE_TIER_PROVIDERS,
  APIKEY_PROVIDERS,
} from "lib/providerCatalog.ts";
import { asObjectRecord, isAnthropicCompatibleProvider, isOpenAICompatibleProvider } from "lib/utils.ts";

// ─── Validation helper ──────────────────────────────────────────────────────────

const KNOWN_PROVIDER_IDS = new Set([
  ...Object.keys(FREE_PROVIDERS),
  ...Object.keys(FREE_TIER_PROVIDERS),
  ...Object.keys(APIKEY_PROVIDERS),
]);

function isKnownProvider(id: string): boolean {
  return KNOWN_PROVIDER_IDS.has(id);
}

// ─── GET /api/providers/catalog ───────────────────────────────────────────────

export async function GET(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  // Serve catalog at /api/providers/catalog (also matches /api/providers via exact route match)
  if (url.pathname.endsWith("/catalog")) {
    return Response.json(
      {
        free: FREE_PROVIDERS,
        freeTier: FREE_TIER_PROVIDERS,
        apiKey: APIKEY_PROVIDERS,
      },
      { headers: CORS_HEADERS }
    );
  }

  // Default: list all connections
  const connections = await getProviderConnections();
  const safe = connections.map((c) => {
    const { apiKey, accessToken, refreshToken, idToken, ...rest } = c as Record<string, unknown>;
    return rest;
  });
  return Response.json({ connections: safe }, { headers: CORS_HEADERS });
}

// ─── POST /api/providers ───────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    const json = await req.json();
    body = asObjectRecord(json) ?? {};
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  const { provider, apiKey, name, priority, baseUrl } = body;

  // Validate provider
  if (!provider || typeof provider !== "string") {
    return Response.json({ error: "Missing required field: provider" }, { status: 400, headers: CORS_HEADERS });
  }

  // Support compatible providers (openai-compatible-* and anthropic-compatible-*)
  const isCompatible =
    isOpenAICompatibleProvider(provider) || isAnthropicCompatibleProvider(provider);

  if (!isKnownProvider(provider) && !isCompatible) {
    return Response.json({ error: `Unknown provider: ${provider}` }, { status: 400, headers: CORS_HEADERS });
  }

  // apiKey is required for non-free-tier
  const isFreeTier = provider in FREE_TIER_PROVIDERS || provider in FREE_PROVIDERS;
  if (!isFreeTier && (!apiKey || typeof apiKey !== "string" || !apiKey.trim())) {
    return Response.json({ error: "API Key is required" }, { status: 400, headers: CORS_HEADERS });
  }

  // Name is required
  if (!name || typeof name !== "string" || !name.trim()) {
    return Response.json({ error: "Name is required" }, { status: 400, headers: CORS_HEADERS });
  }

  // Build the connection record
  // For compatible providers, baseUrl must go inside providerSpecificData
  // (all consumers read from providerSpecificData.baseUrl, not from top-level)
  const providerSpecificData: Record<string, unknown> = {};
  if (isCompatible && baseUrl && typeof baseUrl === "string") {
    providerSpecificData.baseUrl = baseUrl.trim();
  }

  const conn = await createProviderConnection({
    provider,
    authType: "apikey",
    name: (name as string).trim(),
    apiKey: apiKey ? (apiKey as string).trim() : undefined,
    providerSpecificData,
    priority: typeof priority === "number" ? priority : 1,
    isActive: true,
    testStatus: "unknown",
  });

  // Sanitize response
  const { apiKey: _ek, accessToken: _at, refreshToken: _rt, idToken: _it, ...safe } = conn as Record<string, unknown>;
  return Response.json(safe, { status: 201, headers: CORS_HEADERS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

register("/api/providers", { GET, POST, OPTIONS });
register("/api/providers/catalog", { GET, OPTIONS });
