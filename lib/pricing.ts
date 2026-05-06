/**
 * Single source of truth for hardcoded model pricing.
 *
 * This file contains fallback pricing for models that are NOT available in the
 * OpenRouter pricing feed.  Values are per 1M tokens ($/1M).
 *
 * When you add a new model that needs hardcoded pricing, update BOTH exports
 * below so that runtime fallback and DB seeding stay in sync.
 */

export interface PricingEntry {
  input: number;
  output: number;
}

export interface SeedEntry {
  provider: string;
  model: string;
  input: number;
  output: number;
}

// ─── Runtime fallback map ────────────────────────────────────────────────────
// Keys must match the output of normalizeModelName (dots → dashes, suffixes
// stripped, provider prefix stripped).

export const FALLBACK_PRICING: Record<string, PricingEntry> = {
  // Claudible custom models (same pricing as Anthropic equivalents)
  "claude-opus-4-7": { input: 5, output: 25 },
  "claudible-claude-opus-4-7": { input: 5, output: 25 },
  "claudible-claude-sonnet-4-6": { input: 3, output: 15 },
  "claudible-claude-haiku-4-5-20251001": { input: 0.25, output: 1.25 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-opus-4-6": { input: 5, output: 25 },
  "gpt-55": { input: 5, output: 30 },
  "gpt-5.5": { input: 5, output: 30 },
  "gpt-5-5": { input: 5, output: 30 },

  // MiniMax models (keys must match post-normalization, i.e. dots → dashes)
  "minimax-m2-7": { input: 0.5, output: 2 },
  "minimax-m2-5": { input: 0.5, output: 2 },
  "minimax-m2-1": { input: 0.5, output: 2 },
  "MiniMax-M2-7": { input: 0.5, output: 2 },
  "MiniMax-M2-5": { input: 0.5, output: 2 },
  "MiniMax-M2-1": { input: 0.5, output: 2 },

  // Kimi models
  "kimi-x": { input: 0.95, output: 4 },
  "kimi-k2.6": { input: 0.95, output: 4 },
};

// ─── DB seed entries for migration v5 ──────────────────────────────────────────
// These are inserted into the `pricing` table on deploy.  They include the raw
// model name (with dots, suffixes, etc.) so that exact / normalized / stripped
// matching in findPricing works immediately.

export const PRICING_SEED_ENTRIES: SeedEntry[] = [
  // Claudible custom models (same pricing as Anthropic equivalents)
  { provider: "anthropic-compatible-cldb", model: "claude-opus-4-7", input: 5, output: 25 },
  { provider: "anthropic-compatible-cldb", model: "claude-opus-4-6", input: 5, output: 25 },
  { provider: "anthropic-compatible-cldb", model: "claudible-claude-opus-4-7", input: 5, output: 25 },
  { provider: "anthropic-compatible-cldb", model: "claudible-claude-sonnet-4-6", input: 3, output: 15 },
  { provider: "anthropic-compatible-cldb", model: "claudible-claude-haiku-4-5-20251001", input: 0.25, output: 1.25 },

  // MiniMax models across various providers
  { provider: "minimax", model: "MiniMax-M2.7", input: 0.5, output: 2 },
  { provider: "minimax-cn", model: "MiniMax-M2.7", input: 0.5, output: 2 },
  { provider: "alicode", model: "MiniMax-M2.7", input: 0.5, output: 2 },
  { provider: "alicode-intl", model: "MiniMax-M2.7", input: 0.5, output: 2 },
  { provider: "ollama", model: "minimax-m2.7:cloud", input: 0.5, output: 2 },
  { provider: "ollama", model: "minimax-m2.7", input: 0.5, output: 2 },

  // Claude Sonnet 4.6 across various providers
  { provider: "cc", model: "claude-sonnet-4-6", input: 3, output: 15 },
  { provider: "cc", model: "claude-sonnet-4.6", input: 3, output: 15 },
  { provider: "ag", model: "claude-sonnet-4-6", input: 3, output: 15 },
  { provider: "gh", model: "claude-sonnet-4-6", input: 3, output: 15 },
  { provider: "cu", model: "claude-4.6-sonnet-medium-thinking", input: 3, output: 15 },

  // Kimi models
  { provider: "kimi", model: "kimi-x", input: 0.95, output: 4 },
];
