// ─── OAuth API Routes ──────────────────────────────────────────────────────────
// /api/oauth/:provider/:action
// Handles all OAuth flows for qwen, kiro, gemini-cli, iflow, claude

import { checkAdminAuth } from "lib/authMiddleware.ts";
import { CORS_HEADERS } from "lib/cors.ts";
import { register } from "lib/routeRegistry.ts";
import { isOAuthProviderId } from "../../../lib/oauthConfig.ts";
import { asObjectRecord } from "../../../lib/utils.ts";
import {
  requestDeviceCode,
  pollDeviceToken,
  buildAuthorizeUrl,
  exchangeCode,
  buildKiroSocialAuthorizeUrl,
  exchangeKiroSocialCode,
  iflowCookieAuth,
  saveOAuthConnection,
} from "../../../lib/oauthHandlers.ts";
import { createProviderConnection } from "../../../db/index.ts";

type BunRequest = Request & { params: Record<string, string> };

// ─── Device Code Flow ──────────────────────────────────────────────────────────────

async function handleDeviceCode(provider: string, req: Request): Promise<Response> {
  let body: Record<string, unknown> = {};
  try { body = asObjectRecord(await req.json()) ?? {}; } catch { /* empty body ok for some */ }

  try {
    const result = await requestDeviceCode(provider as any, body as any);
    return Response.json(result, { headers: CORS_HEADERS });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}

async function handlePoll(provider: string, req: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try { body = asObjectRecord(await req.json()) ?? {}; } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  const { deviceCode, codeVerifier, extraData } = body;
  if (!deviceCode) {
    return Response.json({ error: "Missing deviceCode" }, { status: 400, headers: CORS_HEADERS });
  }

  try {
    const result = await pollDeviceToken(provider as any, deviceCode as string, (codeVerifier as string) || "", extraData as Record<string, unknown>);

    if (result.success && result.tokens) {
      // Auto-save connection on success
      await saveOAuthConnection(provider, result.tokens);
    }

    return Response.json(result, { headers: CORS_HEADERS });
  } catch (err: any) {
    return Response.json({ success: false, error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}

// ─── Authorization Code Flow ────────────────────────────────────────────────────────

async function handleAuthorize(provider: string, req: Request): Promise<Response> {
  const url = new URL(req.url);
  const redirectUri = url.searchParams.get("redirect_uri") || `${url.origin}/oauth/callback`;

  try {
    const result = await buildAuthorizeUrl(provider as any, redirectUri);
    return Response.json(result, { headers: CORS_HEADERS });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}

async function handleExchange(provider: string, req: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try { body = asObjectRecord(await req.json()) ?? {}; } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  const { code, redirectUri, codeVerifier, state } = body;
  if (!code) {
    return Response.json({ error: "Missing code" }, { status: 400, headers: CORS_HEADERS });
  }

  try {
    const result = await exchangeCode(
      provider as any,
      code as string,
      (redirectUri as string) || "",
      (codeVerifier as string) || undefined,
      (state as string) || undefined
    );
    // Save connection
    await saveOAuthConnection(provider, result);
    return Response.json({ success: true }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}

// ─── Kiro Social Login ──────────────────────────────────────────────────────────────

async function handleKiroSocialAuthorize(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const provider = url.searchParams.get("provider");
  if (!provider || !["google", "github"].includes(provider)) {
    return Response.json({ error: "Invalid provider. Use 'google' or 'github'" }, { status: 400, headers: CORS_HEADERS });
  }

  try {
    const result = await buildKiroSocialAuthorizeUrl(provider as "google" | "github");
    return Response.json(result, { headers: CORS_HEADERS });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}

async function handleKiroSocialExchange(req: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try { body = asObjectRecord(await req.json()) ?? {}; } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  const { code, codeVerifier } = body;
  if (!code || !codeVerifier) {
    return Response.json({ error: "Missing code or codeVerifier" }, { status: 400, headers: CORS_HEADERS });
  }

  try {
    const result = await exchangeKiroSocialCode(code as string, codeVerifier as string);
    await saveOAuthConnection("kiro", result, "social");
    return Response.json({ success: true }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}

// ─── Kiro Manual Import ─────────────────────────────────────────────────────────────

async function handleKiroImport(req: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try { body = asObjectRecord(await req.json()) ?? {}; } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  const { refreshToken } = body;
  if (!refreshToken || typeof refreshToken !== "string") {
    return Response.json({ error: "Missing refreshToken" }, { status: 400, headers: CORS_HEADERS });
  }

  try {
    // Save the imported token as a connection
    await createProviderConnection({
      provider: "kiro",
      authType: "oauth",
      name: "Kiro (Imported)",
      refreshToken: refreshToken.trim(),
      isActive: true,
      testStatus: "unknown",
      providerSpecificData: { authMethod: "imported" },
    });
    return Response.json({ success: true }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}

// ─── iFlow Cookie Auth ──────────────────────────────────────────────────────────────

async function handleIflowCookie(req: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try { body = asObjectRecord(await req.json()) ?? {}; } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  const { cookie } = body;
  if (!cookie || typeof cookie !== "string") {
    return Response.json({ error: "Missing cookie" }, { status: 400, headers: CORS_HEADERS });
  }

  try {
    const result = await iflowCookieAuth(cookie);
    await saveOAuthConnection("iflow", result, "cookie");
    return Response.json({ success: true }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}

// ─── Main Handler ────────────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  const params = (req as BunRequest).params;
  const provider = params.provider;
  const action = params.action;

  if (!provider) {
    return Response.json({ error: "Missing provider" }, { status: 400, headers: CORS_HEADERS });
  }

  if (!isOAuthProviderId(provider)) {
    return Response.json({ error: `Unknown OAuth provider: ${provider}` }, { status: 400, headers: CORS_HEADERS });
  }

  // ─── Device Code Flow ──────────────────────────────────────────────────────
  if (action === "device-code") return handleDeviceCode(provider, req);
  if (action === "poll") return handlePoll(provider, req);

  // ─── Authorization Code Flow ───────────────────────────────────────────────
  if (action === "authorize") return handleAuthorize(provider, req);
  if (action === "exchange") return handleExchange(provider, req);

  // ─── Kiro-specific ─────────────────────────────────────────────────────────
  if (provider === "kiro" && action === "social-authorize") return handleKiroSocialAuthorize(req);
  if (provider === "kiro" && action === "social-exchange") return handleKiroSocialExchange(req);
  if (provider === "kiro" && action === "import") return handleKiroImport(req);

  // ─── iFlow-specific ────────────────────────────────────────────────────────
  if (provider === "iflow" && action === "cookie") return handleIflowCookie(req);

  return Response.json({ error: `Unknown action: ${action}` }, { status: 400, headers: CORS_HEADERS });
}

// GET is used for authorize and social-authorize (convenience)
export async function GET(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  const params = (req as BunRequest).params;
  const provider = params.provider;
  const action = params.action;

  if (!provider) {
    return Response.json({ error: "Missing provider" }, { status: 400, headers: CORS_HEADERS });
  }

  if (!isOAuthProviderId(provider)) {
    return Response.json({ error: `Unknown OAuth provider: ${provider}` }, { status: 400, headers: CORS_HEADERS });
  }

  if (action === "authorize") return handleAuthorize(provider, req);
  if (provider === "kiro" && action === "social-authorize") return handleKiroSocialAuthorize(req);

  return Response.json({ error: `Unknown action: ${action}` }, { status: 400, headers: CORS_HEADERS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

register("/api/oauth/:provider/:action", { GET, POST, OPTIONS });
