/**
 * TrollLLM API routes — proxies calls to trollllm.xyz on behalf of the authenticated user.
 *
 * Auth: User-level (checkAdminAuth).
 * Token: Single env var TROLL_USAGE_TOKEN — shared across all users.
 */

import { checkAdminAuth } from "lib/authMiddleware.ts";
import { register } from "lib/routeRegistry.ts";
import {
  trollGetBilling,
  trollGetStatus,
  trollGetSummary,
  trollGetLogs,
  trollGetMe,
  trollGetPromo,
  trollUpdateDiscord,
} from "lib/trollService.ts";

// ─── Token ─────────────────────────────────────────────────────────────────────

function getTrollToken(): string | null {
  return process.env.TROLL_USAGE_TOKEN ?? null;
}

// ─── Route handlers ─────────────────────────────────────────────────────────────

// GET /api/troll/billing — credits, daily budget, tier, bonus
async function handleBilling(_req: Request, _userId: string): Promise<Response> {
  const token = getTrollToken();
  if (!token) {
    return Response.json(
      { error: "TROLL_USAGE_TOKEN is not configured on the server." },
      { status: 503 }
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
async function handleStatus(_req: Request, _userId: string): Promise<Response> {
  const token = getTrollToken();
  if (!token) {
    return Response.json(
      { error: "TROLL_USAGE_TOKEN is not configured on the server." },
      { status: 503 }
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
async function handleSummary(req: Request, _userId: string): Promise<Response> {
  const url = new URL(req.url);
  const period = url.searchParams.get("period") ?? "1h";
  const token = getTrollToken();
  if (!token) {
    return Response.json(
      { error: "TROLL_USAGE_TOKEN is not configured on the server." },
      { status: 503 }
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
async function handleLogs(req: Request, _userId: string): Promise<Response> {
  const url = new URL(req.url);
  const period = url.searchParams.get("period") ?? "1h";
  const page = parseInt(url.searchParams.get("page") ?? "1", 10);
  const limit = parseInt(url.searchParams.get("limit") ?? "15", 10);
  const token = getTrollToken();
  if (!token) {
    return Response.json(
      { error: "TROLL_USAGE_TOKEN is not configured on the server." },
      { status: 503 }
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
async function handleMe(_req: Request, _userId: string): Promise<Response> {
  const token = getTrollToken();
  if (!token) {
    return Response.json(
      { error: "TROLL_USAGE_TOKEN is not configured on the server." },
      { status: 503 }
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
async function handlePromo(_req: Request, _userId: string): Promise<Response> {
  const token = getTrollToken();
  if (!token) {
    return Response.json(
      { error: "TROLL_USAGE_TOKEN is not configured on the server." },
      { status: 503 }
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

// PUT /api/troll/discord — update Discord ID (uses shared env token)
async function handleDiscord(req: Request, _userId: string): Promise<Response> {
  const token = getTrollToken();
  if (!token) {
    return Response.json(
      { error: "TROLL_USAGE_TOKEN is not configured on the server." },
      { status: 503 }
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

  const url = new URL(req.url);
  const path = url.pathname.replace("/api/troll", "");

  switch (path) {
    case "/billing":
      return handleBilling(req, auth.userId);
    case "/status":
      return handleStatus(req, auth.userId);
    case "/summary":
      return handleSummary(req, auth.userId);
    case "/logs":
      return handleLogs(req, auth.userId);
    case "/me":
      return handleMe(req, auth.userId);
    case "/promo":
      return handlePromo(req, auth.userId);
    case "/discord":
      if (req.method === "PUT") return handleDiscord(req, auth.userId);
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
register("/api/troll/discord", { PUT: handler });
