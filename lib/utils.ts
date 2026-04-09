// Centralized utility helper functions

import {
  ANTHROPIC_API_VERSION,
  OPENAI_COMPATIBLE_PREFIX,
  ANTHROPIC_COMPATIBLE_PREFIX,
} from "./constants.ts";

export function asObjectRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

// ============================================================================
// Provider Type Helpers
// ============================================================================

/** Matches openai-compatible-* provider IDs (custom nodes) */
export function isOpenAICompatibleProvider(providerId: string): boolean {
  return typeof providerId === "string" && providerId.startsWith(OPENAI_COMPATIBLE_PREFIX);
}

/** Matches anthropic-compatible-* provider IDs (custom nodes) */
export function isAnthropicCompatibleProvider(providerId: string): boolean {
  return typeof providerId === "string" && providerId.startsWith(ANTHROPIC_COMPATIBLE_PREFIX);
}

// ============================================================================
// Fetch Helpers
// ============================================================================

/**
 * Fetch with timeout - aborts request after specified milliseconds
 */
export async function fetchWithTimeout(
  url: string,
  opts: RequestInit,
  ms = 10000
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

// ============================================================================
// Error Helpers
// ============================================================================

/**
 * Convert network errors to user-friendly messages
 */
export function friendlyError(err: unknown): string {
  const msg = String(err);
  if (msg.includes("aborted") || msg.includes("timeout")) {
    return "Request timeout (>10s) - provider not responding";
  }
  if (msg.includes("ECONNREFUSED")) return "Connection refused - server offline";
  if (msg.includes("ENOTFOUND")) return "DNS failed - check the domain";
  return "Network error - check URL and connectivity";
}

// ============================================================================
// Model Parsing Helpers
// ============================================================================

/**
 * Parse OpenAI-style model list responses
 * Handles various response formats: array, {data: [...]}, {models: [...]}, {results: [...]}
 */
export function parseOpenAIStyleModels(
  data: unknown
): Array<{ id?: string; name?: string; model?: string }> {
  if (Array.isArray(data)) {
    return data as Array<{ id?: string; name?: string; model?: string }>;
  }
  const d = data as Record<string, unknown>;
  return (d?.data ?? d?.models ?? d?.results ?? []) as Array<{
    id?: string;
    name?: string;
    model?: string;
  }>;
}

/**
 * Extract model IDs from raw model data
 */
export function extractModelIds(
  rawModels: Array<{ id?: string; name?: string; model?: string }>
): string[] {
  return Array.from(
    new Set(
      rawModels
        .map((m) => m?.id ?? m?.name ?? m?.model)
        .filter((id): id is string => typeof id === "string" && id.trim() !== "")
    )
  );
}

// ============================================================================
// URL Helpers
// ============================================================================

/**
 * Derive the /models base URL from a provider's configured chat/completions URL.
 * e.g. "https://api.groq.com/openai/v1/chat/completions" -> "https://api.groq.com/openai/v1"
 */
export function deriveModelsBaseUrl(chatUrl: string): string {
  try {
    const u = new URL(chatUrl);
    const path = u.pathname; // e.g. /openai/v1/chat/completions
    // Find /v1/ in the path and take everything up to and including it
    const v1Idx = path.indexOf("/v1/");
    if (v1Idx !== -1) {
      return u.origin + path.slice(0, v1Idx + 3); // up to /v1
    }
    // No /v1/ found - just return origin
    return u.origin;
  } catch {
    return "";
  }
}

/**
 * Normalize base URL by removing trailing slashes and /messages suffix
 */
export function normalizeBaseUrl(baseUrl: string): string {
  let normalized = baseUrl.trim().replace(/\/$/, "");
  if (normalized.endsWith("/messages")) {
    normalized = normalized.slice(0, -9);
  }
  return normalized;
}

// ============================================================================
// Provider Request Helpers
// ============================================================================

/**
 * Build headers for provider API requests
 */
export function buildProviderHeaders(
  provider: string,
  apiKey: string,
  xApiKeyProviders: Set<string>
): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (xApiKeyProviders.has(provider)) {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = ANTHROPIC_API_VERSION;
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}
