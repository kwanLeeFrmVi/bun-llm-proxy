/**
 * TrollLLM API routes — proxies calls to trollllm.xyz on behalf of the authenticated user.
 *
 * Auth: User-level (checkAdminAuth). The user's TrollLLM session token is stored in
 * the DB under settings key `trollLlmToken:{userId}`.
 *
 * Flow:
 * 1. Frontend calls PUT /api/troll/token with the TrollLLM JWT from the browser.
 *    Backend stores it in DB (never exposed back to client except masked).
 * 2. Frontend calls GET /api/troll/* — backend reads stored token from DB and
 *    forwards it to trollllm.xyz.
 */

import { checkAdminAuth } from "lib/authMiddleware.ts";
import { register } from "lib/routeRegistry.ts";
import { getSettingValue, updateSetting } from "db/index.ts";
import {
  trollGetBilling,
  trollGetStatus,
  trollGetSummary,
  trollGetLogs,
  trollGetMe,
  trollGetPromo,
  trollUpdateDiscord,
} from "lib/trollService.ts";

// ─── Helpers ───────────────────────────────────────────────────────────────────

const TROLL_TOKEN_SETTING_PREFIX = "trollLlmToken:";

function trollTokenSettingKey(userId: string): string {
  return `${TROLL_TOKEN_SETTING_PREFIX}${userId}`;
}

async function getTrollToken(userId: string): Promise<string | null> {
  return getSettingValue<string | null>(trollTokenSettingKey(userId), null);
}

async function setTrollToken(userId: string, token: string): Promise<void> {
  await updateSetting(trollTokenSettingKey(userId), token);
}

function maskToken(token: string): string {
  if (token.length <= 12) return "***";
  return token.slice(0, 6) + "..." + token.slice(-4);
}

// ─── Route handlers ─────────────────────────────────────────────────────────────

// GET /api/troll/billing — credits, daily budget, tier, bonus
async function handleBilling(_req: Request, userId: string): Promise<Response> {
  const token = await getTrollToken(userId);
  if (!token) {
    return Response.json(
      {
        error: "TrollLLM token not configured. Go to TrollLLM settings in the dashboard and paste your TrollLLM session token.",
      },
      { status: 401 }
    );
  }
  try {
    const data = await trollGetBilling(token);
    return Response.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 502 });
  }
}

// GET /api/troll/status — RPM & concurrent limits
async function handleStatus(_req: Request, userId: string): Promise<Response> {
  const token = await getTrollToken(userId);
  if (!token) {
    return Response.json(
      {
        error: "TrollLLM token not configured. Go to TrollLLM settings in the dashboard and paste your TrollLLM session token.",
      },
      { status: 401 }
    );
  }
  try {
    const data = await trollGetStatus(token);
    return Response.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 502 });
  }
}

// GET /api/troll/summary?period=1h — aggregated stats
async function handleSummary(_req: Request, userId: string): Promise<Response> {
  const url = new URL(_req.url);
  const period = url.searchParams.get("period") ?? "1h";
  const token = await getTrollToken(userId);
  if (!token) {
    return Response.json(
      {
        error: "TrollLLM token not configured. Go to TrollLLM settings in the dashboard and paste your TrollLLM session token.",
      },
      { status: 401 }
    );
  }
  try {
    const data = await trollGetSummary(token, period);
    return Response.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 502 });
  }
}

// GET /api/troll/logs?period=&page=&limit= — paginated request logs
async function handleLogs(_req: Request, userId: string): Promise<Response> {
  const url = new URL(_req.url);
  const period = url.searchParams.get("period") ?? "1h";
  const page = parseInt(url.searchParams.get("page") ?? "1", 10);
  const limit = parseInt(url.searchParams.get("limit") ?? "15", 10);
  const token = await getTrollToken(userId);
  if (!token) {
    return Response.json(
      {
        error: "TrollLLM token not configured. Go to TrollLLM settings in the dashboard and paste your TrollLLM session token.",
      },
      { status: 401 }
    );
  }
  try {
    const data = await trollGetLogs(token, period, page, limit);
    return Response.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 502 });
  }
}

// GET /api/troll/me — user profile
async function handleMe(_req: Request, userId: string): Promise<Response> {
  const token = await getTrollToken(userId);
  if (!token) {
    return Response.json(
      {
        error: "TrollLLM token not configured. Go to TrollLLM settings in the dashboard and paste your TrollLLM session token.",
      },
      { status: 401 }
    );
  }
  try {
    const data = await trollGetMe(token);
    return Response.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 502 });
  }
}

// GET /api/troll/promo — active promo bonus
async function handlePromo(_req: Request, userId: string): Promise<Response> {
  const token = await getTrollToken(userId);
  if (!token) {
    return Response.json(
      {
        error: "TrollLLM token not configured. Go to TrollLLM settings in the dashboard and paste your TrollLLM session token.",
      },
      { status: 401 }
    );
  }
  try {
    const data = await trollGetPromo(token);
    return Response.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 502 });
  }
}

// PUT /api/troll/token — save TrollLLM session token
async function handleSaveToken(req: Request, userId: string): Promise<Response> {
  let body: { token?: string };
  try {
    body = (await req.json()) as { token?: string };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.token || typeof body.token !== "string" || body.token.trim() === "") {
    return Response.json({ error: "token is required" }, { status: 400 });
  }

  await setTrollToken(userId, body.token.trim());

  // Validate the token by fetching me
  try {
    const me = await trollGetMe(body.token.trim());
    return Response.json({
      success: true,
      masked: maskToken(body.token.trim()),
      username: me.username,
    });
  } catch {
    // Token was saved but invalid — still return success
    return Response.json({
      success: true,
      masked: maskToken(body.token.trim()),
      warning: "Token saved but could not validate with TrollLLM. It may be expired.",
    });
  }
}

// DELETE /api/troll/token — remove stored TrollLLM token
async function handleDeleteToken(_req: Request, userId: string): Promise<Response> {
  await updateSetting(trollTokenSettingKey(userId), null);
  return Response.json({ success: true });
}

// GET /api/troll/token — check if token is configured (returns masked)
async function handleGetTokenStatus(req: Request, userId: string): Promise<Response> {
  const token = await getTrollToken(userId);
  if (!token) {
    return Response.json({ configured: false });
  }
  return Response.json({ configured: true, masked: maskToken(token) });
}

// PUT /api/troll/discord — update Discord ID
async function handleDiscord(req: Request, userId: string): Promise<Response> {
  const token = await getTrollToken(userId);
  if (!token) {
    return Response.json(
      {
        error: "TrollLLM token not configured. Go to TrollLLM settings in the dashboard and paste your TrollLLM session token.",
      },
      { status: 401 }
    );
  }

  let body: { discordId?: string };
  try {
    body = (await req.json()) as { discordId?: string };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    await trollUpdateDiscord(token, body.discordId ?? "");
    return Response.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 502 });
  }
}

// ─── Router ─────────────────────────────────────────────────────────────────────

async function handler(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  const { userId } = auth;
  const url = new URL(req.url);
  const path = url.pathname.replace("/api/troll", "");

  switch (path) {
    case "/billing":
      return handleBilling(req, userId);
    case "/status":
      return handleStatus(req, userId);
    case "/summary":
      return handleSummary(req, userId);
    case "/logs":
      return handleLogs(req, userId);
    case "/me":
      return handleMe(req, userId);
    case "/promo":
      return handlePromo(req, userId);
    case "/token":
      if (req.method === "GET") return handleGetTokenStatus(req, userId);
      if (req.method === "PUT") return handleSaveToken(req, userId);
      if (req.method === "DELETE") return handleDeleteToken(req, userId);
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    case "/discord":
      if (req.method === "PUT") return handleDiscord(req, userId);
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    default:
      return Response.json({ error: "Not found" }, { status: 404 });
  }
}

// ─── Register ──────────────────────────────────────────────────────────────────

register("/api/troll/billing", { GET: handler });
register("/api/troll/status", { GET: handler });
register("/api/troll/summary", { GET: handler });
register("/api/troll/logs", { GET: handler });
register("/api/troll/me", { GET: handler });
register("/api/troll/promo", { GET: handler });
register("/api/troll/token", { GET: handler, PUT: handler, DELETE: handler });
register("/api/troll/discord", { PUT: handler });
