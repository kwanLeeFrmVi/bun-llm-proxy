/**
 * Pro-X Service — server-side proxy for pro-x.io.vn API.
 *
 * Fetches prox% nodes from the DB, retrieves their API keys,
 * then proxies requests to pro-x.io.vn with optional aggregation.
 */

import { openDb } from "db/index.ts";

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface ProxKeyInfo {
  id: string;
  apiKey: string;
  maskedName: string;
}

export interface ProxStatus {
  name: string;
  key_masked: string;
  plan_type: string;
  balance: number | null;
  rate_limit_amount: number;
  rate_limit_interval_hours: number;
  rate_limit_window_spent: number;
  rate_limit_window_remaining: number;
  rate_limit_window_resets_at: string;
  total_spent: number;
  total_input_tokens: number;
  total_output_tokens: number;
  expiry: string;
  days_remaining: number;
  expired: boolean;
}

export interface ProxSummaryItem {
  model: string;
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost: number;
}

export interface ProxSummary {
  summary: ProxSummaryItem[];
  totals: {
    requests: number;
    input_tokens: number;
    output_tokens: number;
    cost: number;
  };
}

export interface ProxChartPoint {
  date: string;
  cost: number;
  input_tokens: number;
  output_tokens: number;
  requests: number;
}

export interface ProxChart {
  chart: ProxChartPoint[];
}

export interface ProxRecentLog {
  created_at: string;
  model_display: string;
  input_tokens: number;
  output_tokens: number;
  total_cost: number;
}

export interface ProxRecent {
  logs: ProxRecentLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

// ─── DB helpers ────────────────────────────────────────────────────────────────

function db() {
  return openDb();
}

/**
 * Fetch all provider_nodes with prefix LIKE 'prox%', then look up
 * their apiKey from provider_connections JSON data blob.
 */
export async function getProxKeys(): Promise<ProxKeyInfo[]> {
  const rows = db()
    .query<
      { id: string; name: string },
      []
    >(`SELECT id, name FROM provider_nodes WHERE prefix LIKE 'prox%' ORDER BY id LIMIT 300 OFFSET 0`)
    .all();

  const keys: ProxKeyInfo[] = [];
  for (const row of rows) {
    // provider_connections.provider = provider_nodes.id (the node UUID)
    const connRows = db()
      .query<
        { id: string; data: string },
        string
      >(`SELECT id, data FROM provider_connections WHERE provider = ?`)
      .all(row.id);

    for (const conn of connRows) {
      const data = JSON.parse(conn.data) as Record<string, unknown>;
      const apiKey = data.apiKey as string | undefined;
      if (!apiKey) continue;
      const masked = (data.name as string | undefined) ?? row.name ?? `key#${keys.length + 1}`;
      keys.push({
        id: conn.id,
        apiKey,
        maskedName: masked,
      });
    }
  }
  return keys;
}

// ─── Core fetch ────────────────────────────────────────────────────────────────

const PROX_BASE = "https://pro-x.io.vn";

async function proxFetch(apiKey: string, path: string): Promise<Response> {
  const url = path.startsWith("http") ? path : `${PROX_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "*/*",
      Referer: `${PROX_BASE}/dashboard/`,
    },
  });
  return res;
}

// ─── Single-key fetchers ────────────────────────────────────────────────────────

export async function getStatus(apiKey: string): Promise<ProxStatus> {
  const res = await proxFetch(apiKey, "/api/user/status");
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Pro-X /status failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<ProxStatus>;
}

export async function getSummary(days = 0, apiKey: string): Promise<ProxSummary> {
  const res = await proxFetch(apiKey, `/api/user/usage/summary?days=${days}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Pro-X /summary failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<ProxSummary>;
}

export async function getChart(days = 30, apiKey: string): Promise<ProxChart> {
  const res = await proxFetch(apiKey, `/api/user/usage/chart?days=${days}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Pro-X /chart failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<ProxChart>;
}

export async function getRecent(page = 1, limit = 15, apiKey: string): Promise<ProxRecent> {
  const res = await proxFetch(apiKey, `/api/user/usage/recent?page=${page}&limit=${limit}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Pro-X /recent failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<ProxRecent>;
}

// ─── Aggregation ───────────────────────────────────────────────────────────────

function aggregateStatus(statuses: ProxStatus[]): ProxStatus {
  const first = statuses[0]!;
  return {
    name: first.name,
    key_masked: "Aggregated",
    plan_type: first.plan_type,
    balance: first.balance,
    rate_limit_amount: statuses.reduce((s, p) => s + p.rate_limit_amount, 0),
    rate_limit_interval_hours: first.rate_limit_interval_hours,
    rate_limit_window_spent: statuses.reduce((s, p) => s + p.rate_limit_window_spent, 0),
    rate_limit_window_remaining: statuses.reduce((s, p) => s + p.rate_limit_window_remaining, 0),
    rate_limit_window_resets_at: first.rate_limit_window_resets_at,
    total_spent: statuses.reduce((s, p) => s + p.total_spent, 0),
    total_input_tokens: statuses.reduce((s, p) => s + p.total_input_tokens, 0),
    total_output_tokens: statuses.reduce((s, p) => s + p.total_output_tokens, 0),
    expiry: first.expiry,
    days_remaining: first.days_remaining,
    expired: statuses.some((p) => p.expired),
  };
}

function aggregateSummary(summaries: ProxSummary[]): ProxSummary {
  const modelMap = new Map<
    string,
    { requests: number; input: number; output: number; cost: number }
  >();

  for (const s of summaries) {
    for (const item of s.summary) {
      const existing = modelMap.get(item.model);
      if (existing) {
        existing.requests += item.total_requests;
        existing.input += item.total_input_tokens;
        existing.output += item.total_output_tokens;
        existing.cost += item.total_cost;
      } else {
        modelMap.set(item.model, {
          requests: item.total_requests,
          input: item.total_input_tokens,
          output: item.total_output_tokens,
          cost: item.total_cost,
        });
      }
    }
  }

  const summary = [...modelMap.entries()]
    .map(([model, v]) => ({
      model,
      total_requests: v.requests,
      total_input_tokens: v.input,
      total_output_tokens: v.output,
      total_cost: v.cost,
    }))
    .sort((a, b) => b.total_cost - a.total_cost);

  return {
    summary,
    totals: {
      requests: summary.reduce((s, i) => s + i.total_requests, 0),
      input_tokens: summary.reduce((s, i) => s + i.total_input_tokens, 0),
      output_tokens: summary.reduce((s, i) => s + i.total_output_tokens, 0),
      cost: summary.reduce((s, i) => s + i.total_cost, 0),
    },
  };
}

function aggregateChart(charts: ProxChart[]): ProxChart {
  const dateMap = new Map<
    string,
    { cost: number; input: number; output: number; requests: number }
  >();

  for (const c of charts) {
    for (const point of c.chart) {
      const existing = dateMap.get(point.date);
      if (existing) {
        existing.cost += point.cost;
        existing.input += point.input_tokens;
        existing.output += point.output_tokens;
        existing.requests += point.requests;
      } else {
        dateMap.set(point.date, {
          cost: point.cost,
          input: point.input_tokens,
          output: point.output_tokens,
          requests: point.requests,
        });
      }
    }
  }

  const chart: ProxChartPoint[] = [...dateMap.entries()]
    .map(([date, v]) => ({
      date,
      cost: v.cost,
      input_tokens: v.input,
      output_tokens: v.output,
      requests: v.requests,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { chart };
}

// For recent logs: return the most recently paginated page from the first key
// (aggregation of recent logs across keys is complex — show from first key)
async function aggregateRecent(
  page: number,
  limit: number,
  keys: ProxKeyInfo[]
): Promise<ProxRecent> {
  if (keys.length === 0) {
    return { logs: [], pagination: { page: 1, limit, total: 0, total_pages: 0 } };
  }
  // Aggregate: interleave logs from all keys sorted by created_at desc
  const allLogs: ProxRecentLog[] = [];

  await Promise.all(
    keys.map(async (key) => {
      try {
        const recent = await getRecent(1, 500, key.apiKey);
        allLogs.push(...recent.logs);
      } catch {
        // skip failing keys
      }
    })
  );

  // Sort all logs by created_at desc, then paginate
  allLogs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const total = allLogs.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const logs = allLogs.slice(start, start + limit);

  return {
    logs,
    pagination: { page, limit, total, total_pages: totalPages },
  };
}

// ─── Public API (with optional aggregation) ─────────────────────────────────────

export async function proxGetKeys(): Promise<ProxKeyInfo[]> {
  return getProxKeys();
}

export async function proxGetStatus(keyId?: string): Promise<ProxStatus> {
  const keys = await getProxKeys();
  if (keyId) {
    const key = keys.find((k) => k.id === keyId);
    if (!key) throw new Error(`Pro-X key not found: ${keyId}`);
    return getStatus(key.apiKey);
  }
  if (keys.length === 0) {
    throw new Error("No Pro-X keys found in database");
  }
  const statuses = await Promise.all(keys.map((k) => getStatus(k.apiKey)));
  return aggregateStatus(statuses);
}

export async function proxGetSummary(days = 0, keyId?: string): Promise<ProxSummary> {
  const keys = await getProxKeys();
  if (keyId) {
    const key = keys.find((k) => k.id === keyId);
    if (!key) throw new Error(`Pro-X key not found: ${keyId}`);
    return getSummary(days, key.apiKey);
  }
  if (keys.length === 0) {
    return { summary: [], totals: { requests: 0, input_tokens: 0, output_tokens: 0, cost: 0 } };
  }
  const summaries = await Promise.all(keys.map((k) => getSummary(days, k.apiKey)));
  return aggregateSummary(summaries);
}

export async function proxGetChart(days = 30, keyId?: string): Promise<ProxChart> {
  const keys = await getProxKeys();
  if (keyId) {
    const key = keys.find((k) => k.id === keyId);
    if (!key) throw new Error(`Pro-X key not found: ${keyId}`);
    return getChart(days, key.apiKey);
  }
  if (keys.length === 0) {
    return { chart: [] };
  }
  const charts = await Promise.all(keys.map((k) => getChart(days, k.apiKey)));
  return aggregateChart(charts);
}

export async function proxGetRecent(page = 1, limit = 15, keyId?: string): Promise<ProxRecent> {
  const keys = await getProxKeys();
  if (keyId) {
    const key = keys.find((k) => k.id === keyId);
    if (!key) throw new Error(`Pro-X key not found: ${keyId}`);
    return getRecent(page, limit, key.apiKey);
  }
  return aggregateRecent(page, limit, keys);
}
