// Centralized constants for the bun-llm-proxy project
// Single source of truth for commonly used values

// ============================================================================
// Provider Type Prefixes
// ============================================================================

export const OPENAI_COMPATIBLE_PREFIX = "openai-compatible-";
export const ANTHROPIC_COMPATIBLE_PREFIX = "anthropic-compatible-";

// ============================================================================
// Default Provider URLs
// ============================================================================

export const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";
export const ANTHROPIC_DEFAULT_BASE_URL = "https://api.anthropic.com/v1";

// ============================================================================
// Anthropic API Headers
// ============================================================================

export const ANTHROPIC_API_VERSION = "2023-06-01";

export const CLAUDE_API_HEADERS = {
  "Anthropic-Version": ANTHROPIC_API_VERSION,
} as const;

// ============================================================================
// Provider Auth Types
// ============================================================================

/** Providers that use x-api-key header instead of Authorization Bearer */
export const X_API_KEY_PROVIDERS = new Set([
  "claude",
  "anthropic",
  "glm",
  "glm-cn",
  "kimi",
  "kimi-coding",
  "minimax",
  "minimax-cn",
]);

/** Providers that only use accessToken (no API key support) */
export const ACCESS_TOKEN_ONLY_PROVIDERS = new Set([
  "gemini-cli",
  "antigravity",
  "kiro",
]);
