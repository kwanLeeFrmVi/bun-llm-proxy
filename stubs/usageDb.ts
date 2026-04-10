// Real implementation for usage tracking — writes to usage_log SQLite table.
// open-sse internals import these; bun-runtime previously stubbed them out.

import { EventEmitter } from "events";
import { normalizeModelName, stripSuffixes, baseModelName, getORModelCache } from "services/pricingSync.ts";
import { getRawDb } from "db/connection.ts";

// ─── In-memory state ───────────────────────────────────────────────────────────

interface PendingRequest {
  requestId: string;
  timestamp: string;
  endpoint?: string;
  provider?: string;
  model?: string;
  connectionId?: string;
  apiKeyId?: string;
  startTime: number;
}

const pendingRequests = new Map<string, PendingRequest>();

export const statsEmitter = new EventEmitter();
statsEmitter.setMaxListeners(50);

// ─── Helpers ───────────────────────────────────────────────────────────────────

function periodToTimestamp(period: string): string | null {
  const now = Date.now();
  switch (period) {
    case "2h":  return new Date(now - 2 * 60 * 60 * 1000).toISOString();
    case "5h":  return new Date(now - 5 * 60 * 60 * 1000).toISOString();
    case "24h": return new Date(now - 24 * 60 * 60 * 1000).toISOString();
    case "7d":  return new Date(now - 7  * 24 * 60 * 60 * 1000).toISOString();
    case "30d": return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    case "all": return null;
    default:    return new Date(now - 24 * 60 * 60 * 1000).toISOString();
  }
}

export interface UsageRecord {
  id: string;
  timestamp: string;
  endpoint?: string;
  provider?: string;
  model?: string;
  connectionId?: string;
  apiKeyId?: string;
  status: string;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  cost: number;
  durationMs: number;
}

export interface UsageStats {
  totalRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCost: number;
  byProvider: { provider: string; requests: number; cost: number; tokens: number }[];
  byModel:    { model: string;    requests: number; cost: number; tokens: number }[];
  byApiKey:   { apiKeyId: string; requests: number; cost: number }[];
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Record a new pending request. Called at the start of a chat request.
 * Inserts a row into usage_log and stores metadata in memory for later correlation.
 */
export function trackPendingRequest(
  requestId: string,
  meta: {
    endpoint?: string;
    provider?: string;
    model?: string;
    connectionId?: string;
    apiKeyId?: string;
  }
): void {
  const timestamp = new Date().toISOString();
  const db = getRawDb();
  db.run(
    `INSERT INTO usage_log (id, timestamp, endpoint, provider, model, connection_id, api_key_id, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [requestId, timestamp, meta.endpoint ?? null, meta.provider ?? null,
     meta.model ?? null, meta.connectionId ?? null, meta.apiKeyId ?? null]
  );
  pendingRequests.set(requestId, {
    requestId,
    timestamp,
    endpoint: meta.endpoint,
    provider: meta.provider,
    model: meta.model,
    connectionId: meta.connectionId,
    apiKeyId: meta.apiKeyId,
    startTime: Date.now(),
  });
}

/**
 * Called by open-sse after a streaming response completes to save token counts and cost.
 * Looks up the request in the pending map to fill in any missing metadata.
 */
export async function saveRequestUsage(
  requestId: string,
  usage: {
    prompt_tokens?: number;
    completion_tokens?: number;
    reasoning_tokens?: number;
    cached_tokens?: number;
    cost?: number;
    provider?: string;
    model?: string;
  },
  durationMs: number
): Promise<void> {
  const pending = pendingRequests.get(requestId);
  const promptTokens     = usage.prompt_tokens     ?? 0;
  const completionTokens = usage.completion_tokens ?? 0;
  const reasoningTokens  = usage.reasoning_tokens  ?? 0;
  const cachedTokens     = usage.cached_tokens     ?? 0;
  const cost            = usage.cost ?? 0;
  const resolvedProvider = usage.provider ?? pending?.provider;
  const resolvedModel    = usage.model    ?? pending?.model;

  // If open-sse computed a cost, use it; otherwise calculate from pricing if available.
  let finalCost = cost;
  if (finalCost === 0 && resolvedProvider && resolvedModel) {
    finalCost = await calculateCost(resolvedProvider, resolvedModel, promptTokens, completionTokens);
  }

  const db = getRawDb();
  db.run(
    `UPDATE usage_log SET
       prompt_tokens      = ?,
       completion_tokens  = ?,
       reasoning_tokens   = ?,
       cached_tokens       = ?,
       cost                = ?,
       duration_ms         = ?,
       status              = 'ok'
     WHERE id = ? AND status = 'pending'`,
    [promptTokens, completionTokens, reasoningTokens, cachedTokens, finalCost, durationMs, requestId]
  );

  if (pending) {
    pendingRequests.delete(requestId);
  }

  statsEmitter.emit("usage", {
    requestId,
    provider: resolvedProvider,
    model: resolvedModel,
    promptTokens,
    completionTokens,
    cost: finalCost,
    durationMs,
  });
}

/**
 * Update request status (used for errors).
 */
export function appendRequestLog(
  requestId: string,
  status: string,
  _errorMsg?: string
): void {
  const db = getRawDb();
  db.run(
    `UPDATE usage_log SET status = ? WHERE id = ?`,
    [status, requestId]
  );
  pendingRequests.delete(requestId);
}

/**
 * Optional: save full request/response body (low priority — skip for now).
 */
export function saveRequestDetail(
  _requestId: string,
  _body: unknown
): Promise<void> {
  return Promise.resolve(); // no-op for now
}

// ─── Cost calculation ──────────────────────────────────────────────────────────

type PriceEntry = { input: number; output: number };
type ORCacheEntry = { id: string; input: number; output: number };

/**
 * Try to find pricing using multiple fallback strategies:
 * 1. Exact match on provider + model
 * 2. Normalized match (dots → dashes)
 * 3. Suffix-stripped match
 * 4. Base model name match
 * 5. OpenRouter fuzzy lookup (full OR model ID)
 */
async function findPricing(
  pricing: Record<string, Record<string, PriceEntry>>,
  provider: string,
  model: string,
): Promise<PriceEntry | null> {
  // 1. Exact match
  if (pricing[provider]?.[model]) {
    return pricing[provider][model];
  }

  // 2. Normalized match (e.g., "claude-sonnet-4.5" → "claude-sonnet-4-5")
  const normalized = normalizeModelName(model);
  if (normalized !== model && pricing[provider]?.[normalized]) {
    return pricing[provider][normalized];
  }

  // 3. Suffix-stripped match (e.g., "glm-5-turbo" → "glm-5")
  const stripped = stripSuffixes(model);
  if (stripped !== model && pricing[provider]?.[stripped]) {
    return pricing[provider][stripped];
  }

  // 4. Base model name match (e.g., "claude-sonnet-4-5" → "claude-sonnet")
  const base = baseModelName(model);
  if (base !== model && pricing[provider]?.[base]) {
    return pricing[provider][base];
  }

  // 5. OpenRouter fuzzy lookup — always check cache regardless of stripped===model
  const orCache = await getORModelCache();
  if (orCache) {
    // Check normalized, stripped, base, and raw model keys
    for (const key of [normalized, stripped, base, model]) {
      const entry = orCache[key] as ORCacheEntry | undefined;
      if (entry) {
        return { input: entry.input, output: entry.output };
      }
    }
  }

  return null;
}

/**
 * Calculate cost using multi-level fallback pricing lookup.
 * Reads from pricing table and falls back to OpenRouter cached models.
 */
async function calculateCost(
  provider: string,
  model: string,
  promptTokens: number,
  completionTokens: number
): Promise<number> {
  try {
    const db = getRawDb();
    const rows = db
      .query<{ provider: string; model: string; input: number; output: number }, []>(
        "SELECT provider, model, input, output FROM pricing"
      )
      .all();

    const pricing: Record<string, Record<string, PriceEntry>> = {};
    for (const row of rows) {
      if (!pricing[row.provider]) {
        pricing[row.provider] = {};
      }
      pricing[row.provider]![row.model] = { input: row.input, output: row.output };
    }

    const entry = await findPricing(pricing, provider, model);
    if (!entry) return 0;

    return (
      (promptTokens     * entry.input  / 1_000_000) +
      (completionTokens * entry.output / 1_000_000)
    );
  } catch {
    return 0;
  }
}

// ─── Stats query helpers (used by routes/api/usage/index.ts) ───────────────────

export function getUsageStats(period: string): UsageStats {
  const db = getRawDb();
  const since = periodToTimestamp(period);
  const baseWhere = since ? `WHERE timestamp >= '${since.replace(/'/g, "''")}'` : "WHERE 1=1";

  const totals = db
    .query<{ cnt: number; pt: number; ct: number; c: number }, []>(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(prompt_tokens),0) as pt, COALESCE(SUM(completion_tokens),0) as ct, COALESCE(SUM(cost),0) as c FROM usage_log ${baseWhere === "WHERE 1=1" ? "" : baseWhere}`
    )
    .get() ?? { cnt: 0, pt: 0, ct: 0, c: 0 };

  const baseFilter = since ? `timestamp >= '${since.replace(/'/g, "''")}'` : "1=1";

  const byProvider = db.query<{ provider: string; requests: number; cost: number; tokens: number }, []>(
    `SELECT provider, COUNT(*) as requests, SUM(cost) as cost, SUM(prompt_tokens + completion_tokens) as tokens
     FROM usage_log WHERE ${baseFilter} AND provider IS NOT NULL GROUP BY provider ORDER BY tokens DESC`
  ).all();

  const byModel = db.query<{ model: string; requests: number; cost: number; tokens: number }, []>(
    `SELECT model, COUNT(*) as requests, SUM(cost) as cost, SUM(prompt_tokens + completion_tokens) as tokens
     FROM usage_log WHERE ${baseFilter} AND model IS NOT NULL GROUP BY model ORDER BY tokens DESC`
  ).all();

  const byApiKeyRaw = db.query<{ api_key_id: string; requests: number; cost: number }, []>(
    `SELECT api_key_id, COUNT(*) as requests, SUM(cost) as cost
     FROM usage_log WHERE ${baseFilter} AND api_key_id IS NOT NULL GROUP BY api_key_id ORDER BY cost DESC`
  ).all();

  return {
    totalRequests:         totals.cnt,
    totalPromptTokens:     totals.pt,
    totalCompletionTokens: totals.ct,
    totalCost:             totals.c,
    byProvider,
    byModel,
    byApiKey: byApiKeyRaw.map(r => ({ apiKeyId: r.api_key_id, requests: r.requests, cost: r.cost })),
  };
}

export function getUsageDetails(opts: {
  page?: number;
  limit?: number;
  offset?: number;
  provider?: string;
  model?: string;
  apiKeyId?: string;
  startDate?: string;
  endDate?: string;
  period?: string;
}): { rows: UsageRecord[]; total: number } {
  const db = getRawDb();
  const { page, limit = 50, provider, model, apiKeyId, startDate, endDate, period } = opts;
  const offset = opts.offset ?? (page != null ? (page - 1) * limit : 0);

  const conditions: string[] = ["status != 'pending'"];

  // Date filtering: prefer startDate/endDate over period
  if (startDate) conditions.push(`timestamp >= '${startDate.replace(/'/g, "''")}'`);
  if (endDate)   conditions.push(`timestamp <= '${endDate.replace(/'/g, "''")}'`);
  if (!startDate && !endDate && period) {
    const since = periodToTimestamp(period);
    if (since) conditions.push(`timestamp >= '${since.replace(/'/g, "''")}'`);
  }

  if (provider)  conditions.push(`provider  = '${provider.replace(/'/g, "''")}'`);
  if (model)     conditions.push(`model     = '${model.replace(/'/g, "''")}'`);
  if (apiKeyId)  conditions.push(`api_key_id = '${apiKeyId.replace(/'/g, "''")}'`);

  const where = `WHERE ${conditions.join(" AND ")}`;

  const total = (db
    .query<{ cnt: number }, []>(`SELECT COUNT(*) as cnt FROM usage_log ${where}`)
    .get() ?? { cnt: 0 }).cnt;

  const rows = db
    .query<{
      id: string; timestamp: string; endpoint: string; provider: string;
      model: string; connection_id: string; api_key_id: string;
      status: string; prompt_tokens: number; completion_tokens: number;
      reasoning_tokens: number; cached_tokens: number; cost: number; duration_ms: number;
    }, []>(
      `SELECT id, timestamp, endpoint, provider, model, connection_id, api_key_id,
              status, prompt_tokens, completion_tokens, reasoning_tokens, cached_tokens,
              cost, duration_ms
       FROM usage_log ${where}
       ORDER BY timestamp DESC
       LIMIT ${limit} OFFSET ${offset}`
    )
    .all();

  return {
    rows: rows.map(r => ({
      id: r.id,
      timestamp: r.timestamp,
      endpoint: r.endpoint,
      provider: r.provider,
      model: r.model,
      connectionId: r.connection_id,
      apiKeyId: r.api_key_id,
      status: r.status,
      promptTokens: r.prompt_tokens,
      completionTokens: r.completion_tokens,
      reasoningTokens: r.reasoning_tokens,
      cachedTokens: r.cached_tokens,
      cost: r.cost,
      durationMs: r.duration_ms,
    })),
    total,
  };
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  role: string;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  totalCost: number;
  requestCount: number;
}

/**
 * Get per-user token usage leaderboard for a given period.
 * Aggregates usage across all API keys owned by each user.
 * Uses LEFT JOIN to include API keys without associated users (shown as "System").
 */
export function getLeaderboard(period: string): LeaderboardEntry[] {
  const db = getRawDb();
  const since = periodToTimestamp(period);
  const baseFilter = since ? `timestamp >= '${since.replace(/'/g, "''")}'` : "1=1";

  const rows = db.query<{
    user_id: string;
    username: string;
    role: string;
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
    reasoning_tokens: number;
    total_cost: number;
    request_count: number;
  }, []>(
    `SELECT COALESCE(u.id, '00000000-0000-0000-0000-000000000000') as user_id,
            COALESCE(u.username, 'System') as username,
            COALESCE(u.role, 'user') as role,
            SUM(ul.prompt_tokens + ul.completion_tokens) AS total_tokens,
            SUM(ul.prompt_tokens) AS prompt_tokens,
            SUM(ul.completion_tokens) AS completion_tokens,
            COALESCE(SUM(ul.reasoning_tokens), 0) AS reasoning_tokens,
            COALESCE(SUM(ul.cost), 0) AS total_cost,
            COUNT(*) AS request_count
     FROM usage_log ul
     LEFT JOIN api_keys ak ON ul.api_key_id = ak.id
     LEFT JOIN users u ON ak.user_id = u.id
     WHERE ${baseFilter} AND ul.status != 'pending'
     GROUP BY u.id
     ORDER BY total_tokens DESC`
  ).all();

  return rows.map(r => ({
    userId: r.user_id,
    username: r.username,
    role: r.role,
    totalTokens: r.total_tokens ?? 0,
    promptTokens: r.prompt_tokens ?? 0,
    completionTokens: r.completion_tokens ?? 0,
    reasoningTokens: r.reasoning_tokens ?? 0,
    totalCost: r.total_cost ?? 0,
    requestCount: r.request_count ?? 0,
  }));
}
