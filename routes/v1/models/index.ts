// Port of src/app/api/v1/models/route.js
import { PROVIDER_MODELS, PROVIDER_ID_TO_ALIAS } from "ai-bridge/config/providerModels.ts";
import { getProviderAlias, isAnthropicCompatibleProvider, isOpenAICompatibleProvider } from "lib/providers.ts";
import { getProviderConnections, getCombos, getAllProviderEnabledModels, type Combo } from "db/index.ts";
import { getAvailableComboModelConfigs } from "services/model.ts";
import { CORS_HEADERS } from "lib/cors.ts";
import { register } from "lib/routeRegistry";
import { parseOpenAIStyleModels, extractModelIds, normalizeBaseUrl } from "lib/utils.ts";
import { ANTHROPIC_API_VERSION } from "lib/constants.ts";

const providerModels = PROVIDER_MODELS as Record<string, Array<{ id: string; name?: string }>>;
const providerIdToAlias = PROVIDER_ID_TO_ALIAS as Record<string, string>;

function normalizeModelId(modelId: string, prefixes: string[]): string {
  const trimmedModelId = modelId.trim();
  for (const prefix of prefixes) {
    if (trimmedModelId.startsWith(`${prefix}/`)) {
      return trimmedModelId.slice(prefix.length + 1);
    }
  }
  return trimmedModelId;
}

function mergeModelIds(
  baseModelIds: string[],
  enabledModels: unknown,
  prefixes: string[],
): string[] {
  const mergedModelIds = new Set<string>();

  for (const modelId of baseModelIds) {
    const normalizedModelId = normalizeModelId(modelId, prefixes);
    if (normalizedModelId) {
      mergedModelIds.add(normalizedModelId);
    }
  }

  if (Array.isArray(enabledModels)) {
    for (const enabledModel of enabledModels) {
      if (typeof enabledModel !== "string") continue;
      const normalizedModelId = normalizeModelId(enabledModel, prefixes);
      if (normalizedModelId) {
        mergedModelIds.add(normalizedModelId);
      }
    }
  }

  return Array.from(mergedModelIds);
}

async function fetchCompatibleModelIds(connection: Record<string, unknown>): Promise<string[]> {
  if (!connection?.apiKey) return [];

  const psd = (connection.providerSpecificData as Record<string, unknown> | undefined) ?? {};
  const baseUrl = typeof psd.baseUrl === "string" ? normalizeBaseUrl(psd.baseUrl) : "";
  if (!baseUrl) return [];

  let url = `${baseUrl}/models`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (isOpenAICompatibleProvider(connection.provider as string)) {
    headers.Authorization = `Bearer ${connection.apiKey}`;
  } else if (isAnthropicCompatibleProvider(connection.provider as string)) {
    headers["x-api-key"] = connection.apiKey as string;
    headers["anthropic-version"] = ANTHROPIC_API_VERSION;
    headers.Authorization = `Bearer ${connection.apiKey}`;
  } else {
    return [];
  }

  try {
    const response = await fetch(url, { method: "GET", headers, cache: "no-store" });
    if (!response.ok) return [];
    const data = await response.json();
    const rawModels = parseOpenAIStyleModels(data);
    return extractModelIds(rawModels);
  } catch {
    return [];
  }
}

export async function GET(_req: Request): Promise<Response> {
  try {
    let connections: Record<string, unknown>[] = [];
    try {
      connections = (await getProviderConnections()).filter(c => c.isActive !== false);
    } catch {
      console.log("Could not fetch providers, returning all models");
    }

    let combos: Combo[] = [];
    try {
      combos = await getCombos();
    } catch {
      console.log("Could not fetch combos");
    }

    let persistedEnabledModelsByProvider: Record<string, string[]> = {};
    try {
      persistedEnabledModelsByProvider = await getAllProviderEnabledModels();
    } catch {
      console.log("Could not fetch provider enabled models");
    }

    const activeConnectionByProvider = new Map<string, Record<string, unknown>>();
    for (const conn of connections) {
      if (!activeConnectionByProvider.has(conn.provider as string)) {
        activeConnectionByProvider.set(conn.provider as string, conn);
      }
    }

    const models: unknown[] = [];
    const timestamp = Math.floor(Date.now() / 1000);

    for (const combo of combos) {
      const filteredComboModels = await getAvailableComboModelConfigs(combo.name);
      const comboModelIds = filteredComboModels?.map(m => m.model) ?? [];
      // Only include combo if it has at least one available model
      if (comboModelIds.length > 0) {
        models.push({
          id: combo.name,
          object: "model",
          created: timestamp,
          owned_by: "combo",
          permission: [],
          root: combo.name,
          parent: null,
          combo_id: combo.id,
          combo_models: comboModelIds,
        });
      }
    }

    if (connections.length === 0) {
      for (const [alias, pModels] of Object.entries(providerModels)) {
        const providerId = Object.entries(providerIdToAlias).find(([, candidateAlias]) => candidateAlias === alias)?.[0] ?? alias;
        const enabledModels = persistedEnabledModelsByProvider[providerId] ?? [];
        const modelIds = mergeModelIds(
          pModels.map(model => model.id),
          enabledModels,
          [alias, providerId],
        );
        for (const modelId of modelIds) {
          models.push({
            id: `${alias}/${modelId}`,
            object: "model",
            created: timestamp,
            owned_by: alias,
            permission: [],
            root: modelId,
            parent: null,
          });
        }
      }
    } else {
      for (const [providerId, conn] of activeConnectionByProvider.entries()) {
        const staticAlias = providerIdToAlias[providerId] ?? providerId;
        const psd = (conn.providerSpecificData as Record<string, unknown> | undefined) ?? {};

        // For compatible providers, get prefix from provider_nodes table
        let nodePrefix: string | undefined;
        const isCompatibleProvider = isOpenAICompatibleProvider(providerId) || isAnthropicCompatibleProvider(providerId);
        if (isCompatibleProvider) {
          try {
            const { getProviderNodeById } = await import("../../../db/index.ts");
            const node = await getProviderNodeById(providerId);
            nodePrefix = node?.prefix as string | undefined;
          } catch {
            // ignore error
          }
        }

        const outputAlias = (nodePrefix ?? (psd.prefix as string | undefined) ?? getProviderAlias(providerId) ?? staticAlias).trim();
        const pModels = providerModels[staticAlias] ?? [];
        // Use provider-level enabled models only (not connection-specific)
        const enabledModels = persistedEnabledModelsByProvider[providerId] ?? [];
        const prefixes = [outputAlias, staticAlias, providerId].filter(
          (prefix, index, allPrefixes) => prefix && allPrefixes.indexOf(prefix) === index,
        );

        let rawModelIds = mergeModelIds(
          pModels.map(m => m.id),
          enabledModels,
          prefixes,
        );

        if (isCompatibleProvider && rawModelIds.length === 0) {
          rawModelIds = await fetchCompatibleModelIds(conn);
        }

        const modelIds = rawModelIds
          .map(modelId => normalizeModelId(modelId, prefixes))
          .filter((id): id is string => typeof id === "string" && id.trim() !== "");

        for (const modelId of modelIds) {
          models.push({
            id: `${outputAlias}/${modelId}`,
            object: "model",
            created: timestamp,
            owned_by: outputAlias,
            permission: [],
            root: modelId,
            parent: null,
          });
        }
      }
    }

    return Response.json({ object: "list", data: models }, { headers: CORS_HEADERS });
  } catch (error) {
    console.log("Error fetching models:", error);
    return Response.json(
      { error: { message: (error as Error).message, type: "server_error" } },
      { status: 500 }
    );
  }
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

register("/v1/models", { GET, OPTIONS });
