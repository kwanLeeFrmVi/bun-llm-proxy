/**
 * Migration: ~/.bunLLM/db.json → SQLite (router.db)
 * Idempotent: skips if provider_connections already has data.
 * Run: bun db/migrate.ts [path/to/db.json] [--force]
 *      bun db/migrate.ts                              # defaults to ~/.bunLLM/db.json
 *      bun db/migrate.ts /path/to/db.json --force     # force re-migration even if SQLite has data
 */
import { join } from "node:path";
import { homedir } from "node:os";
import { openDb } from "./index.ts";

// Allow overriding the db.json path via CLI argument
const args = process.argv.slice(2);
const forceFlag = args.includes("--force");
const dbJsonPath =
  args.find((a) => a !== "--force") ??
  join(process.env.DATA_DIR ?? join(homedir(), ".bunLLM"), "db.json");

const db = openDb();

// Check if already migrated (unless --force)
const count = db
  .query<{ count: number }, []>("SELECT COUNT(*) as count FROM provider_connections")
  .get();
if ((count?.count ?? 0) > 0 && !forceFlag) {
  console.log("[migrate] SQLite already populated, skipping.");
  console.log("[migrate] Use --force to re-run migration.");
  process.exit(0);
}

if (forceFlag && (count?.count ?? 0) > 0) {
  console.log("[migrate] --force detected, clearing existing data before re-migrating...");
  db.run("DELETE FROM provider_connections");
  db.run("DELETE FROM provider_nodes");
  db.run("DELETE FROM proxy_pools");
  db.run("DELETE FROM combos");
  db.run("DELETE FROM api_keys");
  db.run("DELETE FROM settings");
  db.run("DELETE FROM model_aliases");
  db.run("DELETE FROM mitm_aliases");
  db.run("DELETE FROM pricing");
  db.run("DELETE FROM combo_configs");
}

// Read db.json
const file = Bun.file(dbJsonPath);
if (!(await file.exists())) {
  console.log(`[migrate] No db.json found at ${dbJsonPath}, nothing to migrate.`);
  process.exit(0);
}

const data = (await file.json()) as Record<string, unknown>;
console.log(`[migrate] Reading ${dbJsonPath}`);
console.log(`[migrate] Top-level keys found: ${Object.keys(data).join(", ")}`);

// Helper: try multiple key name variants (old db.json used inconsistent naming)
function pickArray(data: Record<string, unknown>, ...keys: string[]): Record<string, unknown>[] {
  for (const k of keys) {
    const v = data[k];
    if (Array.isArray(v)) return v as Record<string, unknown>[];
  }
  return [];
}

// Helper: convert unknown to string or null
function toStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

// Helper: convert unknown to number with default
function toInt(value: unknown, defaultValue: number = 0): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }
  return defaultValue;
}

// Helper: convert unknown to boolean
function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    return value.toLowerCase() === "true" || value === "1";
  }
  return false;
}

// Helper: extract provider-specific data
function extractProviderSpecificData(data: Record<string, unknown>): Record<string, unknown> {
  const specificFields = [
    "id",
    "provider",
    "name",
    "displayName",
    "email",
    "authType",
    "apiKey",
    "accessToken",
    "refreshToken",
    "idToken",
    "expiresAt",
    "projectId",
    "priority",
    "isActive",
    "testStatus",
    "lastError",
    "errorCode",
    "lastErrorAt",
    "backoffLevel",
    "lastUsedAt",
    "consecutiveUseCount",
    "createdAt",
    "updatedAt",
    "proxyPoolId",
  ];

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!specificFields.includes(key)) {
      result[key] = value;
    }
  }
  return result;
}

// Migrate provider connections (key was "providersConnections" in some db.json versions)
const connections = pickArray(data, "providersConnections", "providerConnections");
if (connections.length === 0 && (data.providerConnections || data.providersConnections)) {
  console.warn(`[migrate] Found provider connection key but value is not an array`);
}
for (const conn of connections) {
  const id = toStringOrNull(conn.id);
  const provider = toStringOrNull(conn.provider);
  if (!id || !provider) {
    console.warn("[migrate] Skipping provider connection with missing id or provider");
    continue;
  }

  const psd = extractProviderSpecificData(conn);

  db.run(
    `INSERT INTO provider_connections (
      id, provider, name, display_name, email, auth_type, api_key,
      access_token, refresh_token, id_token, expires_at, project_id,
      priority, is_active, test_status, last_error, error_code,
      last_error_at, backoff_level, last_used_at, consecutive_use_count,
      provider_specific_data, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      provider,
      toStringOrNull(conn.name),
      toStringOrNull(conn.displayName),
      toStringOrNull(conn.email),
      toStringOrNull(conn.authType),
      toStringOrNull(conn.apiKey),
      toStringOrNull(conn.accessToken),
      toStringOrNull(conn.refreshToken),
      toStringOrNull(conn.idToken),
      toStringOrNull(conn.expiresAt),
      toStringOrNull(conn.projectId),
      toInt(conn.priority, 1),
      toBool(conn.isActive) ? 1 : 0,
      toStringOrNull(conn.testStatus) ?? "unknown",
      toStringOrNull(conn.lastError),
      toIntOrNull(conn.errorCode),
      toStringOrNull(conn.lastErrorAt),
      toInt(conn.backoffLevel, 0),
      toStringOrNull(conn.lastUsedAt),
      toInt(conn.consecutiveUseCount, 0),
      Object.keys(psd).length > 0 ? JSON.stringify(psd) : null,
      toStringOrNull(conn.createdAt) ?? new Date().toISOString(),
      toStringOrNull(conn.updatedAt) ?? new Date().toISOString(),
    ]
  );
}
console.log(`[migrate] Migrated ${connections.length} provider connections`);

// Migrate provider nodes
// Build a map of providerId -> first connection's providerSpecificData.baseUrl
// so we can backfill baseUrl on nodes that don't have it
const baseUrlByProviderId = new Map<string, string>();
for (const conn of connections) {
  const providerId = conn.provider as string;
  if (!providerId) continue;
  const psd = conn.providerSpecificData as Record<string, unknown> | undefined;
  const url = (psd?.baseUrl ?? psd?.base_url ?? "") as string;
  if (url && !baseUrlByProviderId.has(providerId)) {
    baseUrlByProviderId.set(providerId, url);
  }
}

const nodes = pickArray(data, "providerNodes", "providersNodes");
for (const node of nodes) {
  // Support both camelCase and snake_case field names
  let baseUrl = (node.baseUrl ?? node.base_url ?? "") as string;
  const apiType = (node.apiType ?? node.api_type ?? "") as string;
  const name = (node.name ?? "") as string;
  const prefix = (node.prefix ?? "") as string;
  const type = (node.type ?? "") as string;

  // Backfill baseUrl from connections if node doesn't have one
  if (!baseUrl) {
    const inferred = baseUrlByProviderId.get(node.id as string);
    if (inferred) {
      baseUrl = inferred;
      console.log(
        `[migrate] Provider node "${name || node.id}" — inferred baseUrl from connection: ${baseUrl}`
      );
    } else {
      console.warn(
        `[migrate] Provider node "${name || node.id}" has no baseUrl and no connection to infer from — it will need to be updated manually.`
      );
    }
  }

  db.run(
    "INSERT INTO provider_nodes (id, type, name, prefix, api_type, base_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      toStringOrNull(node.id),
      toStringOrNull(type),
      toStringOrNull(name),
      toStringOrNull(prefix),
      toStringOrNull(apiType),
      toStringOrNull(baseUrl),
      toStringOrNull(node.createdAt) ?? new Date().toISOString(),
      toStringOrNull(node.updatedAt) ?? new Date().toISOString(),
    ]
  );
}
console.log(`[migrate] Migrated ${nodes.length} provider nodes`);

// Migrate proxy pools
const pools = pickArray(data, "proxyPools", "proxiesPools");
for (const pool of pools) {
  const id = toStringOrNull(pool.id);
  if (!id) {
    console.warn("[migrate] Skipping proxy pool with missing id");
    continue;
  }

  db.run(
    `INSERT INTO proxy_pools (
      id, name, proxy_url, no_proxy, is_active, strict_proxy,
      test_status, last_tested_at, last_error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      toStringOrNull(pool.name),
      toStringOrNull(pool.proxyUrl),
      toStringOrNull(pool.noProxy),
      toBool(pool.isActive) ? 1 : 0,
      toBool(pool.strictProxy) ? 1 : 0,
      toStringOrNull(pool.testStatus),
      toStringOrNull(pool.lastTestedAt),
      toStringOrNull(pool.lastError),
      toStringOrNull(pool.createdAt) ?? new Date().toISOString(),
      toStringOrNull(pool.updatedAt) ?? new Date().toISOString(),
    ]
  );
}
console.log(`[migrate] Migrated ${pools.length} proxy pools`);

// Migrate combos
const combos = (pickArray(data, "combos") as Array<{ name: string; models: string[] }>) ?? [];
for (const combo of combos) {
  const id = crypto.randomUUID();
  db.run("INSERT INTO combos (id, name, models, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", [
    id,
    combo.name,
    JSON.stringify(combo.models ?? []),
    new Date().toISOString(),
    new Date().toISOString(),
  ]);
}
console.log(`[migrate] Migrated ${combos.length} combos`);

// Migrate API keys
const apiKeys =
  (pickArray(data, "apiKeys") as Array<{
    id: string;
    name: string;
    key: string;
    machineId?: string;
    isActive?: boolean;
    createdAt?: string;
  }>) ?? [];
for (const k of apiKeys) {
  db.run(
    "INSERT INTO api_keys (id, name, key, machine_id, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [
      k.id,
      k.name,
      k.key,
      k.machineId ?? null,
      k.isActive !== false ? 1 : 0,
      k.createdAt ?? new Date().toISOString(),
    ]
  );
}
console.log(`[migrate] Migrated ${apiKeys.length} API keys`);

// Migrate settings
const settings = (data.settings as Record<string, unknown>) ?? {};
for (const [key, value] of Object.entries(settings)) {
  db.run("INSERT INTO settings (key, value) VALUES (?, ?)", [key, JSON.stringify(value)]);
}
console.log(`[migrate] Migrated ${Object.keys(settings).length} settings`);

// Migrate model aliases
const modelAliases = (data.modelAliases as Record<string, string>) ?? {};
for (const [alias, model] of Object.entries(modelAliases)) {
  db.run("INSERT INTO model_aliases (alias, model) VALUES (?, ?)", [alias, model]);
}
console.log(`[migrate] Migrated ${Object.keys(modelAliases).length} model aliases`);

// Migrate MITM aliases
const mitmAlias = (data.mitmAlias as Record<string, Record<string, string>>) ?? {};
for (const [toolName, aliases] of Object.entries(mitmAlias)) {
  for (const [alias, model] of Object.entries(aliases)) {
    db.run("INSERT INTO mitm_aliases (tool_name, alias, model) VALUES (?, ?, ?)", [
      toolName,
      alias,
      model,
    ]);
  }
}
console.log(`[migrate] Migrated MITM aliases`);

// Migrate pricing
const pricing =
  (data.pricing as Record<string, Record<string, { input: number; output: number }>>) ?? {};
for (const [provider, models] of Object.entries(pricing)) {
  for (const [model, prices] of Object.entries(models)) {
    db.run("INSERT INTO pricing (provider, model, input, output) VALUES (?, ?, ?, ?)", [
      provider,
      model,
      prices.input ?? 0,
      prices.output ?? 0,
    ]);
  }
}
console.log(`[migrate] Migrated pricing data`);

// Migrate combo configs
const comboConfigs =
  (data.comboConfigs as Record<string, { models: Array<{ model: string; weight: number }> }>) ?? {};
for (const [comboName, config] of Object.entries(comboConfigs)) {
  for (const item of config.models ?? []) {
    db.run("INSERT INTO combo_configs (combo_name, model, weight) VALUES (?, ?, ?)", [
      comboName,
      item.model,
      item.weight ?? 1,
    ]);
  }
}
console.log(`[migrate] Migrated combo configs`);

console.log("[migrate] Done.");

function toIntOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}
