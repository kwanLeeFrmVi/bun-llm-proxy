/**
 * TrollLLM Service — server-side proxy for trollllm.xyz API.
 *
 * The TrollLLM session token is read from the TROLL_USAGE_TOKEN env var
 * and shared across all dashboard users. It is forwarded as a Bearer token
 * to the TrollLLM upstream on every request.
 */

import type { TrollBilling, TrollUsageStatus, TrollSummary, TrollLogs, TrollMe, TrollPromo } from "dashboard/src/lib/trollTypes.ts";

// ─── Config ─────────────────────────────────────────────────────────────────────

const TROLL_BASE = process.env.TROLLLLM_BASE_URL ?? "https://trollllm.xyz";

// ─── Core fetch ────────────────────────────────────────────────────────────────

/**
 * Fetch from TrollLLM upstream, forwarding the user's session token.
 * Throws if response is non-OK.
 */
async function trollFetch(
  token: string,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const url = path.startsWith("http") ? path : `${TROLL_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      Authorization: `Bearer ${token}`,
      Referer: `${TROLL_BASE}/dashboard`,
      "X-Requested-With": "XMLHttpRequest",
      ...(init.headers as Record<string, string>),
    },
    signal: AbortSignal.timeout(10000),
  });
  return res;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * GET /api/user/billing
 * Returns credits, daily budget, tier, bonus info.
 */
export async function trollGetBilling(token: string): Promise<TrollBilling> {
  const res = await trollFetch(token, "/api/user/billing");
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`TrollLLM /billing failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<TrollBilling>;
}

/**
 * GET /api/user/usage/status
 * Returns RPM & concurrent rate-limit status.
 */
export async function trollGetStatus(token: string): Promise<TrollUsageStatus> {
  const res = await trollFetch(token, "/api/user/usage/status");
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`TrollLLM /usage/status failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<TrollUsageStatus>;
}

/**
 * GET /api/user/request-logs/summary?period=1h
 * Returns aggregated stats (cost, tokens, req count, cached) for the period.
 */
export async function trollGetSummary(
  token: string,
  period = "1h"
): Promise<TrollSummary> {
  const res = await trollFetch(
    token,
    `/api/user/request-logs/summary?period=${encodeURIComponent(period)}`
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`TrollLLM /request-logs/summary failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<TrollSummary>;
}

/**
 * GET /api/user/request-logs?period=&page=&limit=
 * Returns paginated request log rows.
 */
export async function trollGetLogs(
  token: string,
  period = "1h",
  page = 1,
  limit = 15
): Promise<TrollLogs> {
  const res = await trollFetch(
    token,
    `/api/user/request-logs?period=${encodeURIComponent(period)}&page=${page}&limit=${limit}`
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`TrollLLM /request-logs failed (${res.status}): ${text}`);
  }

  const data = await res.json() as {
    requests: Array<{
      id: string;
      model: string;
      upstream: string;
      inputTokens: number;
      outputTokens: number;
      cachedInputTokens: number;
      cacheWriteTokens: number;
      cacheHitTokens: number;
      creditsCost: number;
      durationMs: number;
      isStream: boolean;
      latencyMs: number;
      statusCode: number;
      isSuccess: boolean;
      endpoint: string;
      discountLabel: string;
      errorMessage: string;
      createdAt: string;
    }>;
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    nextCursor: string;
    hasMore: boolean;
  };

  return data as unknown as TrollLogs;
}

/**
 * GET /api/user/me
 * Returns user profile (username, discordId, tier, etc.).
 */
export async function trollGetMe(token: string): Promise<TrollMe> {
  const res = await trollFetch(token, "/api/user/me");
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`TrollLLM /me failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<TrollMe>;
}

/**
 * GET /api/payment/promo
 * Returns active promo bonus info.
 */
export async function trollGetPromo(token: string): Promise<TrollPromo> {
  const res = await trollFetch(token, "/api/payment/promo");
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`TrollLLM /promo failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<TrollPromo>;
}

/**
 * PUT /api/user/discord
 * Updates the user's linked Discord ID.
 * Endpoint guessed from TrollLLM's typical API patterns.
 */
export async function trollUpdateDiscord(token: string, discordId: string): Promise<unknown> {
  const res = await trollFetch(token, "/api/user/discord", {
    method: "PUT",
    body: JSON.stringify({ discordId }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`TrollLLM /discord update failed (${res.status}): ${text}`);
  }
  return res.json();
}
