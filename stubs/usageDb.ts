// Real implementation for usage tracking — writes to usage_log SQLite table.
// open-sse internals import these; bun-runtime previously stubbed them out.

import { EventEmitter } from "events";
import {
  normalizeModelName,
  stripSuffixes,
  baseModelName,
  getORModelCache,
  FALLBACK_PRICING,
} from "services/pricingSync.ts";
import type { Database } from "bun:sqlite";
import { getRawDb } from "db/connection.ts";

// Module-level DB getter — allows tests to inject an in-memory DB
let _getDb: (() => Database) | null = null;

export function setUsageDb(getter: () => Database): void {
  _getDb = getter;
}

export function resetUsageDb(): void {
  _getDb = null;
}

const getDb = (): Database => (_getDb ?? getRawDb)();

// ─── Model name normalization ───────────────────────────────────────────────────

/**
 * Strip provider prefix from a model name.
 * "openai/gpt-4o" → "gpt-4o"
 * "claude-opus-4-6" → "claude-opus-4-6"  (no change if no slash)
 */
export function normalizeModelForQuery(model: string): string {
  const slashIdx = model.indexOf("/");
  return slashIdx >= 0 ? model.slice(slashIdx + 1) : model;
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
  streaming?: boolean;
  firstChunkTime?: number;
}

const pendingRequests = new Map<string, PendingRequest>();

export const statsEmitter = new EventEmitter();
statsEmitter.setMaxListeners(50);

// ─── Helpers ───────────────────────────────────────────────────────────────────

function periodToTimestamp(period: string): string | null {
  const now = Date.now();
  switch (period) {
    case "2h":
      return new Date(now - 2 * 60 * 60 * 1000).toISOString();
    case "5h":
      return new Date(now - 5 * 60 * 60 * 1000).toISOString();
    case "24h":
      return new Date(now - 24 * 60 * 60 * 1000).toISOString();
    case "7d":
      return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    case "30d":
      return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    case "all":
      return null;
    default:
      return new Date(now - 24 * 60 * 60 * 1000).toISOString();
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
  streaming: boolean;
  ttftMs: number | null;
  tokensPerSecond: number | null;
}

export interface UsageStats {
  totalRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCost: number;
  byProvider: { provider: string; requests: number; cost: number; tokens: number }[];
  byModel: { model: string; requests: number; cost: number; tokens: number }[];
  byApiKey: { apiKeyId: string; requests: number; cost: number }[];
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
    streaming?: boolean;
  }
): void {
  const timestamp = new Date().toISOString();
  const db = getDb();
  db.run(
    `INSERT INTO usage_log (id, timestamp, endpoint, provider, model, connection_id, api_key_id, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [
      requestId,
      timestamp,
      meta.endpoint ?? null,
      meta.provider ?? null,
      meta.model ?? null,
      meta.connectionId ?? null,
      meta.apiKeyId ?? null,
    ]
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
    streaming: meta.streaming,
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
    ttft_ms?: number;
    tokens_per_second?: number;
  },
  durationMs: number
): Promise<void> {
  const pending = pendingRequests.get(requestId);
  const promptTokens = usage.prompt_tokens ?? 0;
  const completionTokens = usage.completion_tokens ?? 0;
  const reasoningTokens = usage.reasoning_tokens ?? 0;
  const cachedTokens = usage.cached_tokens ?? 0;
  const cost = usage.cost ?? 0;
  const resolvedProvider = usage.provider ?? pending?.provider;
  const resolvedModel = usage.model ?? pending?.model;

  // If open-sse computed a cost, use it; otherwise calculate from pricing if available.
  let finalCost = cost;
  if (finalCost === 0 && resolvedProvider && resolvedModel) {
    finalCost = await calculateCost(
      resolvedProvider,
      resolvedModel,
      promptTokens,
      completionTokens
    );
  }

  const db = getDb();
  db.run(
    `UPDATE usage_log SET
       prompt_tokens      = ?,
       completion_tokens  = ?,
       reasoning_tokens   = ?,
       cached_tokens       = ?,
       cost                = ?,
       duration_ms         = ?,
       streaming           = ?,
       ttft_ms             = ?,
       tokens_per_second   = ?,
       status              = 'ok'
     WHERE id = ? AND status = 'pending'`,
    [
      promptTokens,
      completionTokens,
      reasoningTokens,
      cachedTokens,
      finalCost,
      durationMs,
      pending?.streaming ? 1 : 0,
      usage.ttft_ms ?? null,
      usage.tokens_per_second ?? null,
      requestId,
    ]
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
export function appendRequestLog(requestId: string, status: string, _errorMsg?: string): void {
  const db = getDb();
  db.run(`UPDATE usage_log SET status = ? WHERE id = ?`, [status, requestId]);
  pendingRequests.delete(requestId);
}

/**
 * Optional: save full request/response body (low priority — skip for now).
 */
export function saveRequestDetail(_requestId: string, _body: unknown): Promise<void> {
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
  model: string
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

  // 6. Fallback: try openrouter provider in pricing table (for when cache is empty)
  const openrouterPricing = pricing["openrouter"];
  if (openrouterPricing) {
    for (const [key, value] of Object.entries(openrouterPricing)) {
      if (
        key === model ||
        key === normalized ||
        key === stripped ||
        key === base ||
        normalizeModelName(key) === normalized
      ) {
        return { input: value.input, output: value.output };
      }
    }
  }

  // 7. Hardcoded fallback for models not available in OpenRouter
  for (const key of [model, normalized, stripped, base]) {
    const entry = FALLBACK_PRICING[key];
    if (entry) {
      return { input: entry.input, output: entry.output };
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
    const db = getDb();
    const rows = db
      .query<
        { provider: string; model: string; input: number; output: number },
        []
      >("SELECT provider, model, input, output FROM pricing")
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

    return (promptTokens * entry.input) / 1_000_000 + (completionTokens * entry.output) / 1_000_000;
  } catch {
    return 0;
  }
}

// ─── Stats query helpers (used by routes/api/usage/index.ts) ───────────────────

export function getUsageStats(period: string): UsageStats {
  const db = getDb();
  const since = periodToTimestamp(period);
  const baseWhere = since ? `WHERE timestamp >= '${since.replace(/'/g, "''")}'` : "WHERE 1=1";

  const totals = db
    .query<
      { cnt: number; pt: number; ct: number; c: number },
      []
    >(`SELECT COUNT(*) as cnt, COALESCE(SUM(prompt_tokens),0) as pt, COALESCE(SUM(completion_tokens),0) as ct, COALESCE(SUM(cost),0) as c FROM usage_log ${baseWhere === "WHERE 1=1" ? "" : baseWhere}`)
    .get() ?? { cnt: 0, pt: 0, ct: 0, c: 0 };

  const baseFilter = since ? `timestamp >= '${since.replace(/'/g, "''")}'` : "1=1";

  const byProvider = db
    .query<{ provider: string; requests: number; cost: number; tokens: number }, []>(
      `SELECT provider, COUNT(*) as requests, SUM(cost) as cost, SUM(prompt_tokens + completion_tokens) as tokens
     FROM usage_log WHERE ${baseFilter} AND provider IS NOT NULL GROUP BY provider ORDER BY tokens DESC`
    )
    .all();

  const byModel = db
    .query<{ model: string; requests: number; cost: number; tokens: number }, []>(
      `SELECT model,
       COUNT(*) as requests, SUM(cost) as cost, SUM(prompt_tokens + completion_tokens) as tokens
     FROM usage_log WHERE ${baseFilter} AND model IS NOT NULL
     GROUP BY model ORDER BY tokens DESC`
    )
    .all()
    .map((r) => ({ ...r, model: normalizeModelForQuery(r.model) }));

  const byApiKeyRaw = db
    .query<{ api_key_id: string; requests: number; cost: number }, []>(
      `SELECT api_key_id, COUNT(*) as requests, SUM(cost) as cost
     FROM usage_log WHERE ${baseFilter} AND api_key_id IS NOT NULL GROUP BY api_key_id ORDER BY cost DESC`
    )
    .all();

  return {
    totalRequests: totals.cnt,
    totalPromptTokens: totals.pt,
    totalCompletionTokens: totals.ct,
    totalCost: totals.c,
    byProvider,
    byModel,
    byApiKey: byApiKeyRaw.map((r) => ({
      apiKeyId: r.api_key_id,
      requests: r.requests,
      cost: r.cost,
    })),
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
  const db = getDb();
  const { page, limit = 50, provider, model, apiKeyId, startDate, endDate, period } = opts;
  const offset = opts.offset ?? (page != null ? (page - 1) * limit : 0);

  const conditions: string[] = ["status != 'pending'"];

  // Date filtering: prefer startDate/endDate over period
  if (startDate) conditions.push(`timestamp >= '${startDate.replace(/'/g, "''")}'`);
  if (endDate) conditions.push(`timestamp <= '${endDate.replace(/'/g, "''")}'`);
  if (!startDate && !endDate && period) {
    const since = periodToTimestamp(period);
    if (since) conditions.push(`timestamp >= '${since.replace(/'/g, "''")}'`);
  }

  if (provider) conditions.push(`provider  = '${provider.replace(/'/g, "''")}'`);
  if (model) conditions.push(`model     = '${normalizeModelForQuery(model).replace(/'/g, "''")}'`);
  if (apiKeyId) conditions.push(`api_key_id = '${apiKeyId.replace(/'/g, "''")}'`);

  const where = `WHERE ${conditions.join(" AND ")}`;

  const total = (
    db.query<{ cnt: number }, []>(`SELECT COUNT(*) as cnt FROM usage_log ${where}`).get() ?? {
      cnt: 0,
    }
  ).cnt;

  const rows = db
    .query<
      {
        id: string;
        timestamp: string;
        endpoint: string;
        provider: string;
        model: string;
        connection_id: string;
        api_key_id: string;
        status: string;
        prompt_tokens: number;
        completion_tokens: number;
        reasoning_tokens: number;
        cached_tokens: number;
        cost: number;
        duration_ms: number;
        streaming: number;
        ttft_ms: number | null;
        tokens_per_second: number | null;
      },
      []
    >(
      `SELECT id, timestamp, endpoint, provider, model, connection_id, api_key_id,
              status, prompt_tokens, completion_tokens, reasoning_tokens, cached_tokens,
              cost, duration_ms, streaming, ttft_ms, tokens_per_second
       FROM usage_log ${where}
       ORDER BY timestamp DESC
       LIMIT ${limit} OFFSET ${offset}`
    )
    .all();

  return {
    rows: rows.map((r) => ({
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
      streaming: r.streaming === 1,
      ttftMs: r.ttft_ms,
      tokensPerSecond: r.tokens_per_second,
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
  const db = getDb();
  const since = periodToTimestamp(period);
  const baseFilter = since ? `timestamp >= '${since.replace(/'/g, "''")}'` : "1=1";

  const rows = db
    .query<
      {
        user_id: string;
        username: string;
        role: string;
        total_tokens: number;
        prompt_tokens: number;
        completion_tokens: number;
        reasoning_tokens: number;
        total_cost: number;
        request_count: number;
      },
      []
    >(
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
    )
    .all();

  return rows.map((r) => ({
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

// ─── Per-model stats helpers ─────────────────────────────────────────────────

export interface ModelStatsSummary {
  model: string;
  provider: string;
  requestCount: number;
  failedCount: number;
  failedRate: number;
  ttftMin: number | null;
  ttftAvg: number | null;
  ttftMax: number | null;
  tpsMin: number | null;
  tpsAvg: number | null;
  tpsMax: number | null;
  latencyMin: number | null;
  latencyAvg: number | null;
  latencyMax: number | null;
}

export interface ModelStatsRow {
  id: string;
  timestamp: string;
  status: string;
  provider: string;
  model: string;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
  streaming: boolean;
  ttftMs: number | null;
  tokensPerSecond: number | null;
}

export interface ModelStatsResponse {
  model: string;
  period: string;
  summary: ModelStatsSummary;
  rows: ModelStatsRow[];
  total: number;
}

export interface ModelLatestStats {
  model: string;
  provider: string;
  latestTtftMs: number | null;
  latestTokensPerSecond: number | null;
}

/**
 * Get per-model stats summary and request rows for a given time period.
 */
/**
 * Look up combo member models from both combo_configs and combos tables.
 * Returns empty array if the name is not a combo.
 */
function getComboMembers(db: Database, comboName: string): string[] {
  // Check combo_configs first (individual rows per member)
  const configRows = db
    .query<{ model: string }, [string]>(
      `SELECT model FROM combo_configs WHERE combo_name = ?`
    )
    .all(comboName);
  if (configRows.length > 0) return configRows.map((r) => r.model);

  // Check combos table (JSON models field)
  const comboRow = db
    .query<{ models: string }, [string]>(
      `SELECT models FROM combos WHERE name = ?`
    )
    .get(comboName);
  if (comboRow) {
    try {
      const parsed = JSON.parse(comboRow.models);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // ignore parse errors
    }
  }

  return [];
}

/**
 * Resolve a model name to its actual DB model names.
 * If the model is a combo, recursively resolves sub-combos to get bare model names.
 * If not a combo, returns the normalized model name as-is.
 */
function resolveModelNames(db: Database, model: string): string[] {
  const normalized = normalizeModelForQuery(model);

  // Check if this is a combo model
  const members = getComboMembers(db, normalized);
  if (members.length === 0) return [normalized];

  // Recursively resolve sub-combos
  const allModels = new Set<string>();
  const queue = [...members];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const m = queue.shift()!;
    if (visited.has(m)) continue;
    visited.add(m);

    // If the member name contains a slash (e.g. "trll/gpt-5.4"), it's a specific provider/model reference.
    // We normalize it to get the bare model name (e.g. "gpt-5.4") and treat it as a leaf.
    // We MUST NOT try to resolve it further as a combo, even if the bare name matches a combo name,
    // because that's how it's stored in usage_log.
    if (m.includes("/")) {
      allModels.add(normalizeModelForQuery(m));
      continue;
    }

    const bare = normalizeModelForQuery(m);
    const subMembers = getComboMembers(db, bare);
    if (subMembers.length > 0) {
      queue.push(...subMembers);
    } else {
      allModels.add(bare);
    }
  }
  return [...allModels];
}

export function getModelStats(
  model: string,
  period: string,
  opts?: { page?: number; limit?: number }
): ModelStatsResponse {
  const db = getDb();
  const since = periodToTimestamp(period);
  const limit = opts?.limit ?? 50;
  const offset = opts?.page ? (opts.page - 1) * limit : 0;
  const timeFilter = since ? `AND timestamp >= '${since}'` : "";

  // Resolve combo models to their actual member models
  const resolvedModels = resolveModelNames(db, model);
  const modelFilter =
    resolvedModels.length === 1
      ? `model = '${resolvedModels[0]!.replace(/'/g, "''")}'`
      : `model IN (${resolvedModels.map((m) => `'${m.replace(/'/g, "''")}'`).join(",")})`;

  // Get provider for this model
  const providerRow = db
    .query<{ provider: string }, []>(
      `SELECT provider FROM usage_log WHERE ${modelFilter} AND provider IS NOT NULL ${timeFilter} LIMIT 1`
    )
    .get();
  const provider = providerRow?.provider ?? "";

  // Summary cards
  const summary = db
    .query<
      {
        total: number;
        failed: number;
        ttft_min: number | null;
        ttft_avg: number | null;
        ttft_max: number | null;
        tps_min: number | null;
        tps_avg: number | null;
        tps_max: number | null;
        lat_min: number | null;
        lat_avg: number | null;
        lat_max: number | null;
      },
      []
    >(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN status NOT IN ('ok', 'pending') THEN 1 ELSE 0 END) as failed,
         MIN(CASE WHEN ttft_ms IS NOT NULL THEN ttft_ms END) as ttft_min,
         AVG(CASE WHEN ttft_ms IS NOT NULL THEN ttft_ms END) as ttft_avg,
         MAX(CASE WHEN ttft_ms IS NOT NULL THEN ttft_ms END) as ttft_max,
         MIN(CASE WHEN tokens_per_second IS NOT NULL THEN tokens_per_second END) as tps_min,
         AVG(CASE WHEN tokens_per_second IS NOT NULL THEN tokens_per_second END) as tps_avg,
         MAX(CASE WHEN tokens_per_second IS NOT NULL THEN tokens_per_second END) as tps_max,
         MIN(duration_ms) as lat_min,
         AVG(duration_ms) as lat_avg,
         MAX(duration_ms) as lat_max
       FROM usage_log
       WHERE ${modelFilter} AND status != 'pending' ${timeFilter}`
    )
    .get();

  const totalCount = db
    .query<{ cnt: number }, []>(
      `SELECT COUNT(*) as cnt FROM usage_log WHERE ${modelFilter} AND status != 'pending' ${timeFilter}`
    )
    .get();

  // Request rows
  const rows = db
    .query<
      {
        id: string;
        timestamp: string;
        status: string;
        provider: string;
        model: string;
        duration_ms: number;
        prompt_tokens: number;
        completion_tokens: number;
        streaming: number;
        ttft_ms: number | null;
        tokens_per_second: number | null;
      },
      []
    >(
      `SELECT id, timestamp, status, provider, model, duration_ms,
              prompt_tokens, completion_tokens, streaming, ttft_ms, tokens_per_second
       FROM usage_log
       WHERE ${modelFilter} AND status != 'pending' ${timeFilter}
       ORDER BY timestamp DESC
       LIMIT ${limit} OFFSET ${offset}`
    )
    .all();

  return {
    model,
    period,
    summary: {
      model,
      provider,
      requestCount: summary?.total ?? 0,
      failedCount: summary?.failed ?? 0,
      failedRate: summary && summary.total > 0 ? (summary.failed / summary.total) * 100 : 0,
      ttftMin: summary?.ttft_min ?? null,
      ttftAvg: summary?.ttft_avg ? Math.round(summary.ttft_avg) : null,
      ttftMax: summary?.ttft_max ?? null,
      tpsMin: summary?.tps_min ?? null,
      tpsAvg: summary?.tps_avg ? Math.round(summary.tps_avg * 100) / 100 : null,
      tpsMax: summary?.tps_max ?? null,
      latencyMin: summary?.lat_min ?? null,
      latencyAvg: summary?.lat_avg ? Math.round(summary.lat_avg) : null,
      latencyMax: summary?.lat_max ?? null,
    },
    rows: rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      status: r.status,
      provider: r.provider,
      model: r.model,
      durationMs: r.duration_ms,
      promptTokens: r.prompt_tokens,
      completionTokens: r.completion_tokens,
      streaming: r.streaming === 1,
      ttftMs: r.ttft_ms,
      tokensPerSecond: r.tokens_per_second,
    })),
    total: totalCount?.cnt ?? 0,
  };
}

/**
 * Get latest successful streaming stats for each model.
 * Returns one row per distinct model with the most recent TTFT and tokens/s.
 */
export function getModelsLatestStats(): ModelLatestStats[] {
  const db = getDb();

  const rows = db
    .query<
      {
        model: string;
        provider: string;
        avg_ttft_ms: number | null;
        avg_tps: number | null;
      },
      []
    >(
      `SELECT
         model,
         provider,
         AVG(ttft_ms) as avg_ttft_ms,
         AVG(tokens_per_second) as avg_tps
       FROM usage_log
       WHERE status = 'ok' AND ttft_ms IS NOT NULL
       GROUP BY model, provider`
    )
    .all();

  const result: ModelLatestStats[] = rows.map((r) => ({
    model: r.model,
    provider: r.provider,
    latestTtftMs: r.avg_ttft_ms != null ? Math.round(r.avg_ttft_ms) : null,
    latestTokensPerSecond:
      r.avg_tps != null ? Math.round(r.avg_tps * 100) / 100 : null,
  }));

  // Build a lookup map from bare model name → stats
  const statsMap = new Map<string, ModelLatestStats>();
  for (const r of result) {
    statsMap.set(r.model, r);
  }

  // Resolve combo models: for each combo, compute avg stats across all member models
  // Get all combo names from both combo_configs and combos tables
  const allComboNames = new Set<string>();
  const configCombos = db
    .query<{ combo_name: string }, []>(
      `SELECT DISTINCT combo_name FROM combo_configs`
    )
    .all();
  for (const c of configCombos) allComboNames.add(c.combo_name);

  const jsonCombos = db
    .query<{ name: string }, []>(`SELECT name FROM combos`)
    .all();
  for (const c of jsonCombos) allComboNames.add(c.name);

  for (const comboName of allComboNames) {
    // Skip if we already have direct stats for this combo name
    if (statsMap.has(comboName)) continue;

    // Use resolveModelNames to recursively resolve all member models
    const resolvedModels = resolveModelNames(db, comboName);

    // Compute average TTFT and TPS across all member models that have stats
    const ttftValues: number[] = [];
    const tpsValues: number[] = [];
    for (const memberModel of resolvedModels) {
      const memberStat = statsMap.get(memberModel);
      if (memberStat?.latestTtftMs != null) ttftValues.push(memberStat.latestTtftMs);
      if (memberStat?.latestTokensPerSecond != null)
        tpsValues.push(memberStat.latestTokensPerSecond);
    }

    if (ttftValues.length > 0 || tpsValues.length > 0) {
      const avgTtft =
        ttftValues.length > 0
          ? Math.round(ttftValues.reduce((a, b) => a + b, 0) / ttftValues.length)
          : null;
      const avgTps =
        tpsValues.length > 0
          ? Math.round((tpsValues.reduce((a, b) => a + b, 0) / tpsValues.length) * 100) / 100
          : null;
      result.push({
        model: comboName,
        provider: "combo",
        latestTtftMs: avgTtft,
        latestTokensPerSecond: avgTps,
      });
    }
  }

  return result;
}
