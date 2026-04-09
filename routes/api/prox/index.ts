// Pro-X API routes
import { checkAdminAuth } from "lib/authMiddleware.ts";
import { register } from "lib/routeRegistry.ts";
import {
  proxGetKeys,
  proxGetStatus,
  proxGetSummary,
  proxGetChart,
  proxGetRecent,
} from "lib/proxService.ts";

// GET /api/prox/keys — list available prox% keys
async function handleKeys(_req: Request): Promise<Response> {
  try {
    const keys = await proxGetKeys();
    return Response.json({
      keys: keys.map((k) => ({ id: k.id, maskedName: k.maskedName })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 502 });
  }
}

// GET /api/prox/status?key= — get status (aggregated or single key)
async function handleStatus(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const keyId = url.searchParams.get("key") ?? undefined;
  try {
    const status = await proxGetStatus(keyId);
    return Response.json(status);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 502 });
  }
}

// GET /api/prox/summary?days=&key= — get usage summary
async function handleSummary(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const days = parseInt(url.searchParams.get("days") ?? "0", 10);
  const keyId = url.searchParams.get("key") ?? undefined;
  try {
    const summary = await proxGetSummary(days, keyId);
    return Response.json(summary);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 502 });
  }
}

// GET /api/prox/chart?days=&key= — get usage chart
async function handleChart(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const days = parseInt(url.searchParams.get("days") ?? "30", 10);
  const keyId = url.searchParams.get("key") ?? undefined;
  try {
    const chart = await proxGetChart(days, keyId);
    return Response.json(chart);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 502 });
  }
}

// GET /api/prox/recent?page=&limit=&key= — get recent logs
async function handleRecent(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get("page") ?? "1", 10);
  const limit = parseInt(url.searchParams.get("limit") ?? "15", 10);
  const keyId = url.searchParams.get("key") ?? undefined;
  try {
    const recent = await proxGetRecent(page, limit, keyId);
    return Response.json(recent);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 502 });
  }
}

async function handler(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const path = url.pathname;

  if (path === "/api/prox/keys") return handleKeys(req);
  if (path === "/api/prox/status") return handleStatus(req);
  if (path === "/api/prox/summary") return handleSummary(req);
  if (path === "/api/prox/chart") return handleChart(req);
  if (path === "/api/prox/recent") return handleRecent(req);

  return Response.json({ error: "Not found" }, { status: 404 });
}

register("/api/prox/keys",   { GET: (req) => handler(req) });
register("/api/prox/status",  { GET: (req) => handler(req) });
register("/api/prox/summary", { GET: (req) => handler(req) });
register("/api/prox/chart",   { GET: (req) => handler(req) });
register("/api/prox/recent",  { GET: (req) => handler(req) });