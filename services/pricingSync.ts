// Fetches and syncs pricing from OpenRouter.
// Stores normalized pricing in KV and raw data in Redis for fuzzy matching.

import { getRedisCache, setRedisCache } from "lib/redis.ts";
import { getPricing, updatePricing } from "db/index.ts";
import * as log from "lib/logger.ts";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const CACHE_KEY = "openrouter:models";
const CACHE_TTL = 6 * 60 * 60; // 6 hours in seconds

// Common suffixes to strip when normalizing model names
const STRIP_SUFFIXES = [
  "-turbo", "-maas", "-fast", "-ultra", "-large", "-mini", "-hd",
  "-code", "-instruct", "-preview", "-latest",
];

// In-memory cache of normalized model name → { id, input, output }
type ORCacheEntry = { id: string; input: number; output: number };
let orModelCache: Record<string, ORCacheEntry> | null = null;

/**
 * Normalize a model name for matching:
 * 1. Strip provider prefix (e.g., "anthropic/claude-sonnet-4-5" → "claude-sonnet-4-5")
 * 2. Replace dots with dashes in version segments
 * 3. Strip common suffixes
 */
export function normalizeModelName(model: string): string {
  let name = model;

  // Strip provider prefix
  if (name.includes("/")) {
    name = name.split("/").slice(1).join("/");
  }

  // Replace dots with dashes in version-like segments (e.g., "claude-sonnet-4.5" → "claude-sonnet-4-5")
  name = name.replace(/(\d+)\.(\d+)/g, "$1-$2");

  // Strip common suffixes
  for (const suffix of STRIP_SUFFIXES) {
    if (name.toLowerCase().endsWith(suffix)) {
      name = name.slice(0, -suffix.length);
    }
  }

  return name;
}

/**
 * Strip common suffixes from a model name (without the normalization step).
 */
export function stripSuffixes(model: string): string {
  let name = model;
  for (const suffix of STRIP_SUFFIXES) {
    if (name.toLowerCase().endsWith(suffix)) {
      name = name.slice(0, -suffix.length);
    }
  }
  return name;
}

/**
 * Extract base model (everything before the first dash after the provider prefix).
 * e.g., "claude-sonnet-4-5" → "claude-sonnet"
 */
export function baseModelName(model: string): string {
  const normalized = normalizeModelName(model);
  // Heuristic: if first part is a known base model name, return as-is
  // Otherwise strip trailing version segments
  const knownBases = ["claude-sonnet", "claude-opus", "gpt-4", "gpt-3.5", "gemini"];
  for (const base of knownBases) {
    if (normalized.startsWith(base)) return base;
  }
  // Strip last 1-2 segments (version numbers)
  const idx = normalized.lastIndexOf("-");
  if (idx > 0) {
    const candidate = normalized.slice(0, idx);
    // Only strip if it still has content
    if (candidate.length > 2) return candidate;
  }
  return normalized;
}

export interface SyncResult {
  success: boolean;
  models: number;
  providers: number;
  cached: boolean;
  error?: string;
}

export interface OpenRouterModel {
  id: string;
  pricing: {
    prompt: string;
    completion: string;
    input_cache_read?: string;
    input_cache_write?: string;
  };
}

/**
 * Fetch models from OpenRouter API, with Redis cache.
 */
async function fetchOpenRouterModels(apiKey?: string): Promise<OpenRouterModel[]> {
  // Try Redis cache first
  const cached = await getRedisCache(CACHE_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as OpenRouterModel[];
      log.info("PRICING", `Using cached OpenRouter models (${parsed.length} models)`);
      return parsed;
    } catch {
      // Invalid cache, refetch
    }
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  log.info("PRICING", "Fetching models from OpenRouter...");
  const response = await fetch(OPENROUTER_MODELS_URL, { headers });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`OpenRouter returned ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = await response.json() as { data: OpenRouterModel[] };
  const models = data.data ?? [];

  // Cache in Redis
  await setRedisCache(CACHE_KEY, JSON.stringify(models), CACHE_TTL);
  log.info("PRICING", `Fetched and cached ${models.length} OpenRouter models`);

  return models;
}

/**
 * Build the pricing map from OpenRouter models.
 * Keys: full OpenRouter model ID (e.g., "anthropic/claude-sonnet-4-5")
 * Values: { input, output } in $/1M tokens
 */
function buildPricingMap(models: OpenRouterModel[]): Record<string, Record<string, number>> {
  const pricing: Record<string, Record<string, number>> = {};

  for (const model of models) {
    const inputPrice = parseFloat(model.pricing.prompt ?? "0") * 1_000_000;
    const outputPrice = parseFloat(model.pricing.completion ?? "0") * 1_000_000;

    if (inputPrice === 0 && outputPrice === 0) continue; // Skip free models with no price

    pricing[model.id] = {
      input: inputPrice,
      output: outputPrice,
    };
  }

  return pricing;
}

/**
 * Build a lookup map for fuzzy matching (normalized name → full model ID → pricing).
 * Loaded lazily into memory on first cost calculation.
 */
function buildFuzzyLookup(models: OpenRouterModel[]): Record<string, { id: string; input: number; output: number }> {
  const lookup: Record<string, { id: string; input: number; output: number }> = {};

  for (const model of models) {
    const normalized = normalizeModelName(model.id);
    const stripped = stripSuffixes(model.id);
    const base = baseModelName(model.id);
    const inputPrice = parseFloat(model.pricing.prompt ?? "0") * 1_000_000;
    const outputPrice = parseFloat(model.pricing.completion ?? "0") * 1_000_000;

    if (inputPrice === 0 && outputPrice === 0) continue;

    const entry = { id: model.id, input: inputPrice, output: outputPrice };

    // Multiple keys for the same pricing (different normalization levels)
    lookup[normalized] = entry;
    lookup[stripped] = entry;
    lookup[base] = entry;
    lookup[model.id] = entry;
  }

  return lookup;
}

/**
 * Sync OpenRouter pricing to KV store.
 * Merges with existing pricing data (doesn't overwrite other providers).
 */
export async function syncOpenRouterPricing(apiKey?: string): Promise<SyncResult> {
  try {
    const models = await fetchOpenRouterModels(apiKey);
    const pricing = buildPricingMap(models);

    // Merge with existing pricing (don't overwrite other providers)
    const existing = await getPricing();

    // Ensure openrouter key exists and merge
    existing["openrouter"] = {
      ...(existing["openrouter"] ?? {}),
      ...pricing,
    };

    await updatePricing(existing);

    // Load fuzzy lookup into memory
    orModelCache = buildFuzzyLookup(models);

    const providers = new Set(models.map(m => m.id.split("/")[0])).size;
    const cached = !!(await getRedisCache(CACHE_KEY));

    log.info("PRICING", `Synced ${models.length} models from ${providers} providers`);

    return {
      success: true,
      models: models.length,
      providers,
      cached,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("PRICING", `Sync failed: ${msg}`);
    return {
      success: false,
      models: 0,
      providers: 0,
      cached: false,
      error: msg,
    };
  }
}

/**
 * Get the in-memory OpenRouter model cache, loading from Redis if needed.
 */
export async function getORModelCache(): Promise<Record<string, { id: string; input: number; output: number }> | null> {
  if (orModelCache) return orModelCache;

  const cached = await getRedisCache(CACHE_KEY);
  if (!cached) return null;

  try {
    const models = JSON.parse(cached) as OpenRouterModel[];
    orModelCache = buildFuzzyLookup(models);
    return orModelCache;
  } catch {
    return null;
  }
}
