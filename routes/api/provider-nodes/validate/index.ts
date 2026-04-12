import { checkAdminAuth } from "lib/authMiddleware.ts";
import { CORS_HEADERS } from "lib/cors.ts";
import { register } from "lib/routeRegistry";
import { asObjectRecord, fetchWithTimeout, friendlyError, normalizeBaseUrl } from "lib/utils.ts";
import { ANTHROPIC_API_VERSION } from "lib/constants.ts";

// POST /api/provider-nodes/validate
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

  const { baseUrl, apiKey, type, modelId } = body;

  if (!baseUrl || !apiKey) {
    return Response.json(
      { error: "Base URL and API key required" },
      { status: 400, headers: CORS_HEADERS }
    );
  }
  if (typeof baseUrl !== "string" || typeof apiKey !== "string") {
    return Response.json(
      { error: "baseUrl and apiKey must be strings" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const isAnthropic = type === "anthropic-compatible";

  // Normalize base URL
  const normalizedBase = normalizeBaseUrl(baseUrl);

  // Try /models endpoint
  const modelsUrl = isAnthropic ? `${normalizedBase}/models` : `${normalizedBase}/models`;
  let modelsRes: Response;
  try {
    if (isAnthropic) {
      modelsRes = await fetchWithTimeout(modelsUrl, {
        method: "GET",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_API_VERSION,
          Authorization: `Bearer ${apiKey}`,
        },
      });
    } else {
      modelsRes = await fetchWithTimeout(modelsUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
    }
  } catch (err) {
    return Response.json(
      { valid: false, error: friendlyError(err) },
      { status: 500, headers: CORS_HEADERS }
    );
  }

  if (modelsRes.ok) {
    return Response.json({ valid: true }, { headers: CORS_HEADERS });
  }

  // Auth error → no point in chat fallback
  if (modelsRes.status === 401 || modelsRes.status === 403) {
    return Response.json(
      { valid: false, error: "API key unauthorized" },
      { headers: CORS_HEADERS }
    );
  }

  // Try chat/completions fallback if modelId provided
  if (modelId && typeof modelId === "string" && modelId.trim()) {
    const chatUrl = isAnthropic
      ? `${normalizedBase}/messages`
      : `${normalizedBase}/chat/completions`;

    let chatRes: Response;
    try {
      if (isAnthropic) {
        chatRes = await fetchWithTimeout(chatUrl, {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": ANTHROPIC_API_VERSION,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: modelId.trim(),
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 1,
          }),
        });
      } else {
        chatRes = await fetchWithTimeout(chatUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: modelId.trim(),
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 1,
          }),
        });
      }
    } catch (err) {
      return Response.json(
        { valid: false, error: friendlyError(err), method: "chat" },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    if (chatRes.ok) {
      return Response.json({ valid: true, method: "chat" }, { headers: CORS_HEADERS });
    }
    return Response.json(
      { valid: false, error: `Request failed (${chatRes.status})`, method: "chat" },
      { headers: CORS_HEADERS }
    );
  }

  return Response.json(
    { valid: false, error: `/models endpoint returned ${modelsRes.status}` },
    { headers: CORS_HEADERS }
  );
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

register("/api/provider-nodes/validate", { POST, OPTIONS });
