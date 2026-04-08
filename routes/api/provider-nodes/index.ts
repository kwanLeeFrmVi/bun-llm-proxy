import { createProviderNode, getProviderNodes } from "@/lib/localDb";
import { checkAdminAuth } from "lib/authMiddleware.ts";
import { CORS_HEADERS } from "lib/cors.ts";
import { register } from "lib/routeRegistry";

const OPENAI_COMPATIBLE_PREFIX    = "openai-compatible-";
const ANTHROPIC_COMPATIBLE_PREFIX = "anthropic-compatible-";

const OPENAI_DEFAULTS    = { baseUrl: "https://api.openai.com/v1" };
const ANTHROPIC_DEFAULTS = { baseUrl: "https://api.anthropic.com/v1" };

// GET /api/provider-nodes
export async function GET(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;
  const nodes = await getProviderNodes();
  return Response.json({ nodes }, { headers: CORS_HEADERS });
}

// POST /api/provider-nodes
export async function POST(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  const { name, prefix, apiType, baseUrl, type } = body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return Response.json({ error: "Name is required" }, { status: 400, headers: CORS_HEADERS });
  }
  if (!prefix || typeof prefix !== "string" || !prefix.trim()) {
    return Response.json({ error: "Prefix is required" }, { status: 400, headers: CORS_HEADERS });
  }

  const nodeType = (type as string) || "openai-compatible";

  if (nodeType === "openai-compatible") {
    if (apiType && !["chat", "responses"].includes(apiType as string)) {
      return Response.json({ error: "Invalid API type for OpenAI Compatible" }, { status: 400, headers: CORS_HEADERS });
    }
    const resolvedType = (apiType as string) || "chat";
    const node = await createProviderNode({
      id: `${OPENAI_COMPATIBLE_PREFIX}${resolvedType}-${Date.now()}`,
      type: "openai-compatible",
      prefix: (prefix as string).trim(),
      apiType: resolvedType,
      baseUrl: ((baseUrl as string) || OPENAI_DEFAULTS.baseUrl).trim(),
      name: (name as string).trim(),
    });
    return Response.json({ node }, { status: 201, headers: CORS_HEADERS });
  }

  if (nodeType === "anthropic-compatible") {
    let cleanBaseUrl = ((baseUrl as string) || ANTHROPIC_DEFAULTS.baseUrl).trim().replace(/\/$/, "");
    if (cleanBaseUrl.endsWith("/messages")) {
      cleanBaseUrl = cleanBaseUrl.slice(0, -9);
    }
    const node = await createProviderNode({
      id: `${ANTHROPIC_COMPATIBLE_PREFIX}${Date.now()}`,
      type: "anthropic-compatible",
      prefix: (prefix as string).trim(),
      baseUrl: cleanBaseUrl,
      name: (name as string).trim(),
    });
    return Response.json({ node }, { status: 201, headers: CORS_HEADERS });
  }

  return Response.json({ error: "Invalid provider node type" }, { status: 400, headers: CORS_HEADERS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

register("/api/provider-nodes", { GET, POST, OPTIONS });
