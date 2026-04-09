// Real implementation for usage tracking — writes to usage_log SQLite table.
// open-sse internals import these; bun-runtime previously stubbed them out.

import { EventEmitter } from "events";
import type { Database } from "bun:sqlite";
import { normalizeModelName, stripSuffixes, baseModelName, getORModelCache } from "services/pricingSync.ts";

// ─── DB singleton (inline to avoid circular dep on full db/index.ts) ───────────

let _db: Database | null = null;

function db(): Database {
  if (_db) return _db;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  // biome-ignore start: bun:sqlite is only available in Bun runtime
  const Database = require("bun:sqlite").Database as { new (path: string): Database };
  // biome-ignore end
  const { join } = require("node:path");
  const { homedir } = require("node:os");
  const dataDir = process.env.DATA_DIR ?? join(homedir(), ".bunLLM");
  _db = new Database(join(dataDir, "router.db"));
  return _db;
}

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
  db().run(
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

  db().run(
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
  db().run(
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
 * Reads from KV (pricing) and falls back to OpenRouter cached models.
 */
async function calculateCost(
  provider: string,
  model: string,
  promptTokens: number,
  completionTokens: number
): Promise<number> {
  try {
    const row = db()
      .query<{ value: string }, string>("SELECT value FROM kv WHERE key = 'pricing'")
      .get("pricing");
    if (!row) return 0;
    const pricing = JSON.parse(row.value) as Record<
      string,
      Record<string, PriceEntry>
    >;

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
  const since = periodToTimestamp(period);
  const baseWhere = since ? `WHERE timestamp >= '${since.replace(/'/g, "''")}'` : "WHERE 1=1";

  const totals = db()
    .query<{ cnt: number; pt: number; ct: number; c: number }, []>(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(prompt_tokens),0) as pt, COALESCE(SUM(completion_tokens),0) as ct, COALESCE(SUM(cost),0) as c FROM usage_log ${baseWhere === "WHERE 1=1" ? "" : baseWhere}`
    )
    .get() ?? { cnt: 0, pt: 0, ct: 0, c: 0 };

  const baseFilter = since ? `timestamp >= '${since.replace(/'/g, "''")}'` : "1=1";

  const byProvider = db().query<{ provider: string; requests: number; cost: number; tokens: number }, []>(
    `SELECT provider, COUNT(*) as requests, SUM(cost) as cost, SUM(prompt_tokens + completion_tokens) as tokens
     FROM usage_log WHERE ${baseFilter} AND provider IS NOT NULL GROUP BY provider ORDER BY cost DESC`
  ).all();

  const byModel = db().query<{ model: string; requests: number; cost: number; tokens: number }, []>(
    `SELECT model, COUNT(*) as requests, SUM(cost) as cost, SUM(prompt_tokens + completion_tokens) as tokens
     FROM usage_log WHERE ${baseFilter} AND model IS NOT NULL GROUP BY model ORDER BY cost DESC`
  ).all();

  const byApiKeyRaw = db().query<{ api_key_id: string; requests: number; cost: number }, []>(
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

  const total = (db()
    .query<{ cnt: number }, []>(`SELECT COUNT(*) as cnt FROM usage_log ${where}`)
    .get() ?? { cnt: 0 }).cnt;

  const rows = db()
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
