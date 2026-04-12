// Model parsing, alias resolution, and combo handling.
// Native TypeScript — no open-sse dependency.

import {
  getModelAliases,
  getComboByName,
  getComboConfig,
  getProviderConnections,
  getProviderNodes,
  type ComboModelConfig,
} from "../db/index.ts";
import {
  parseModel as _parseModel,
  resolveModelAliasFromMap,
  getModelInfoCore as _getModelInfoCore,
} from "../ai-bridge/services/model.ts";

export { parseModel as parseModel } from "../ai-bridge/services/model.ts";

async function getStoredComboModelConfigs(modelStr: string): Promise<ComboModelConfig[] | null> {
  const comboConfig = await getComboConfig(modelStr);
  if (comboConfig && comboConfig.models.length > 0) {
    return comboConfig.models;
  }

  const combo = await getComboByName(modelStr);
  if (combo && combo.models && combo.models.length > 0) {
    return combo.models.map((model) => ({ model, weight: 1 }));
  }

  return null;
}

async function getActiveProviderIds(): Promise<Set<string>> {
  const connections = await getProviderConnections({ isActive: true });
  return new Set(connections.map((connection) => connection.provider));
}

/**
 * Resolve model alias from DB
 */
export async function resolveModelAlias(alias: string): Promise<unknown> {
  const aliases = await getModelAliases();
  return resolveModelAliasFromMap(alias, aliases);
}

/**
 * Get full model info (parse or resolve alias/combo)
 */
export async function getModelInfo(
  modelStr: string
): Promise<{ provider: string | null; model: string }> {
  const parsed = _parseModel(modelStr) as {
    isAlias: boolean;
    provider: string;
    providerAlias: string;
    model: string;
  };

  if (!parsed.isAlias) {
    if (parsed.provider === parsed.providerAlias) {
      const openaiNodes = await getProviderNodes({ type: "openai-compatible" });
      const matchedOpenAI = openaiNodes.find((node) => node.prefix === parsed.providerAlias);
      if (matchedOpenAI) {
        return { provider: matchedOpenAI.id as string, model: parsed.model };
      }

      const anthropicNodes = await getProviderNodes({ type: "anthropic-compatible" });
      const matchedAnthropic = anthropicNodes.find((node) => node.prefix === parsed.providerAlias);
      if (matchedAnthropic) {
        return { provider: matchedAnthropic.id as string, model: parsed.model };
      }
    }
    return { provider: parsed.provider, model: parsed.model };
  }

  const combo = await getComboByName(parsed.model);
  if (combo) {
    return { provider: null, model: parsed.model };
  }

  return _getModelInfoCore(modelStr, getModelAliases) as Promise<{
    provider: string | null;
    model: string;
  }>;
}

/**
 * Check if model is a combo and get models list.
 * Returns array of models or null if not a combo.
 */
export async function getComboModels(modelStr: string): Promise<string[] | null> {
  if (modelStr.includes("/")) return null;
  const combo = await getComboByName(modelStr);
  if (combo && combo.models && combo.models.length > 0) {
    return combo.models;
  }
  return null;
}

/**
 * Get combo model configs with weights (pure lookup, no availability filtering).
 * Returns array of {model, weight} or null if not a combo.
 * Falls back to legacy string array (weight=1 for all).
 */
export async function getComboModelConfigs(modelStr: string): Promise<ComboModelConfig[] | null> {
  if (modelStr.includes("/")) return null;
  return getStoredComboModelConfigs(modelStr);
}

/**
 * Get combo model configs filtered to only models whose providers have
 * at least one active connection. Returns null if the name is not a combo
 * or if no models have an active provider.
 *
 * Handles nested combos by recursively resolving them.
 */
export async function getAvailableComboModelConfigs(
  modelStr: string
): Promise<ComboModelConfig[] | null> {
  if (modelStr.includes("/")) return null;

  const comboModels = await getStoredComboModelConfigs(modelStr);
  if (!comboModels) {
    return null;
  }

  const activeProviderIds = await getActiveProviderIds();
  if (activeProviderIds.size === 0) {
    return null;
  }

  const expandedModels: ComboModelConfig[] = [];

  for (const comboModel of comboModels) {
    try {
      // Check if this model is itself a combo (nested combo)
      const nestedCombo = await getComboByName(comboModel.model);

      if (nestedCombo) {
        // Recursively get the nested combo's available models
        const nestedModels = await getAvailableComboModelConfigs(comboModel.model);
        if (nestedModels && nestedModels.length > 0) {
          // Add nested models with their weights multiplied by the outer reference weight
          for (const nested of nestedModels) {
            expandedModels.push({
              model: nested.model,
              weight: nested.weight * comboModel.weight,
            });
          }
        }
      } else {
        // Not a combo - check if the provider is active
        const modelInfo = await getModelInfo(comboModel.model);
        if (modelInfo.provider && activeProviderIds.has(modelInfo.provider)) {
          expandedModels.push(comboModel);
        }
      }
    } catch {
      // Skip models that fail to resolve
    }
  }

  return expandedModels.length > 0 ? expandedModels : null;
}
