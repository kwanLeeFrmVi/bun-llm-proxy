import { createProviderNode, getProviderNodes } from "@/lib/localDb";
import { checkAdminAuth } from "lib/authMiddleware.ts";
import { CORS_HEADERS } from "lib/cors.ts";
import { register } from "lib/routeRegistry";
import { asObjectRecord } from "lib/utils.ts";
import {
  OPENAI_COMPATIBLE_PREFIX,
  ANTHROPIC_COMPATIBLE_PREFIX,
  OPENAI_DEFAULT_BASE_URL,
  ANTHROPIC_DEFAULT_BASE_URL,
} from "lib/constants.ts";

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
    const json = await req.json();
    body = asObjectRecord(json) ?? {};
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

  // Sanitize prefix: only alphanumeric, dashes, and underscores allowed
  const sanitizedPrefix = (prefix as string).trim().replace(/[^a-zA-Z0-9-_]/g, "");
  if (!sanitizedPrefix) {
    return Response.json(
      { error: "Prefix must contain at least one alphanumeric character" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // Check prefix uniqueness
  const existingNodes = await getProviderNodes();
  const existingNode = existingNodes.find((n) => n.prefix === sanitizedPrefix);
  if (existingNode) {
    return Response.json(
      { error: `Prefix "${sanitizedPrefix}" already exists` },
      { status: 409, headers: CORS_HEADERS }
    );
  }

  const nodeType = (type as string) || "openai-compatible";

  if (nodeType === "openai-compatible") {
    if (apiType && !["chat", "responses"].includes(apiType as string)) {
      return Response.json(
        { error: "Invalid API type for OpenAI Compatible" },
        { status: 400, headers: CORS_HEADERS }
      );
    }
    const resolvedType = (apiType as string) || "chat";
    const node = await createProviderNode({
      id: `${OPENAI_COMPATIBLE_PREFIX}${sanitizedPrefix}`,
      type: "openai-compatible",
      prefix: sanitizedPrefix,
      apiType: resolvedType,
      baseUrl: ((baseUrl as string) || OPENAI_DEFAULT_BASE_URL).trim(),
      name: (name as string).trim(),
    });
    return Response.json({ node }, { status: 201, headers: CORS_HEADERS });
  }

  if (nodeType === "anthropic-compatible") {
    let cleanBaseUrl = ((baseUrl as string) || ANTHROPIC_DEFAULT_BASE_URL)
      .trim()
      .replace(/\/$/, "");
    if (cleanBaseUrl.endsWith("/messages")) {
      cleanBaseUrl = cleanBaseUrl.slice(0, -9);
    }
    const node = await createProviderNode({
      id: `${ANTHROPIC_COMPATIBLE_PREFIX}${sanitizedPrefix}`,
      type: "anthropic-compatible",
      prefix: sanitizedPrefix,
      baseUrl: cleanBaseUrl,
      name: (name as string).trim(),
    });
    return Response.json({ node }, { status: 201, headers: CORS_HEADERS });
  }

  return Response.json(
    { error: "Invalid provider node type" },
    { status: 400, headers: CORS_HEADERS }
  );
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

register("/api/provider-nodes", { GET, POST, OPTIONS });
