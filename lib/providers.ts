// Provider helpers — reads from ai-bridge's provider model registry.

import { PROVIDER_ID_TO_ALIAS } from "../ai-bridge/config/providerModels.ts";

// Re-export from centralized constants and utils
export { OPENAI_COMPATIBLE_PREFIX, ANTHROPIC_COMPATIBLE_PREFIX } from "./constants.ts";

export { isOpenAICompatibleProvider, isAnthropicCompatibleProvider } from "./utils.ts";

// Invert ID→alias to get alias→ID
const ALIAS_TO_ID: Record<string, string> = Object.fromEntries(
  Object.entries(PROVIDER_ID_TO_ALIAS as Record<string, string>).map(([id, alias]) => [alias, id])
);

/** Resolve provider alias → canonical ID (e.g. "kc" → "kilocode") */
export function resolveProviderId(aliasOrId: string): string {
  return ALIAS_TO_ID[aliasOrId] ?? aliasOrId;
}

/** Get alias from provider ID (e.g. "kilocode" → "kc") */
export function getProviderAlias(providerId: string): string {
  return (PROVIDER_ID_TO_ALIAS as Record<string, string>)[providerId] ?? providerId;
}

// In-memory cache for provider display names
const providerDisplayNameCache = new Map<string, string>();

/**
 * Get human-readable provider display name.
 * For custom providers (anthropic-compatible-*, openai-compatible-*), fetches the node name from DB.
 * Otherwise falls back to alias or ID.
 * Results are cached in-memory for performance.
 */
export async function getProviderDisplayName(providerId: string): Promise<string> {
  // Check cache first
  if (providerDisplayNameCache.has(providerId)) {
    return providerDisplayNameCache.get(providerId)!;
  }

  const isCustom =
    providerId.startsWith("anthropic-compatible-") || providerId.startsWith("openai-compatible-");

  if (isCustom) {
    try {
      const { getProviderNodeById } = await import("../db/index.ts");
      const node = await getProviderNodeById(providerId);
      if (node?.name) {
        providerDisplayNameCache.set(providerId, node.name);
        return node.name;
      }
    } catch {
      // Fall through to fallback
    }
  }

  const fallback = getProviderAlias(providerId);
  providerDisplayNameCache.set(providerId, fallback);
  return fallback;
}
