/**
 * Migration: ~/.bunLLM/db.json → SQLite (router.db)
 * Idempotent: skips if provider_connections already has data.
 * Run: bun db/migrate.ts [path/to/db.json] [--force]
 *      bun db/migrate.ts                              # defaults to ~/.bunLLM/db.json
 *      bun db/migrate.ts /path/to/db.json --force     # force re-migration even if SQLite has data
 */
import { join } from "node:path";
import { homedir } from "node:os";
import {
  openDb,
  createProviderConnection,
  createProviderNode,
  createProxyPool,
  createCombo,
} from "./index.ts";
import { KV_KEYS } from "./schema.ts";

// Allow overriding the db.json path via CLI argument
const args = process.argv.slice(2);
const forceFlag = args.includes("--force");
const dbJsonPath = args.find(a => a !== "--force") ?? join(process.env.DATA_DIR ?? join(homedir(), ".bunLLM"), "db.json");

const db = openDb();

// Check if already migrated (unless --force)
const count = db.query<{ count: number }, []>("SELECT COUNT(*) as count FROM provider_connections").get();
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
  db.run("DELETE FROM kv");
}

// Read db.json
const file = Bun.file(dbJsonPath);
if (!(await file.exists())) {
  console.log(`[migrate] No db.json found at ${dbJsonPath}, nothing to migrate.`);
  process.exit(0);
}

const data = await file.json() as Record<string, unknown>;
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

// Migrate provider connections (key was "providersConnections" in some db.json versions)
const connections = pickArray(data, "providersConnections", "providerConnections");
if (connections.length === 0 && (data.providerConnections || data.providersConnections)) {
  console.warn(`[migrate] Found provider connection key but value is not an array`);
}
for (const conn of connections) {
  await createProviderConnection(conn);
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
      console.log(`[migrate] Provider node "${name || node.id}" — inferred baseUrl from connection: ${baseUrl}`);
    } else {
      console.warn(`[migrate] Provider node "${name || node.id}" has no baseUrl and no connection to infer from — it will need to be updated manually.`);
    }
  }

  await createProviderNode({
    id: node.id as string,
    type,
    name,
    prefix,
    apiType,
    baseUrl,
  });
}
console.log(`[migrate] Migrated ${nodes.length} provider nodes`);

// Migrate proxy pools
const pools = pickArray(data, "proxyPools", "proxiesPools");
for (const pool of pools) {
  await createProxyPool(pool);
}
console.log(`[migrate] Migrated ${pools.length} proxy pools`);

// Migrate combos
const combos = (pickArray(data, "combos") as Array<{ name: string; models: string[] }>) ?? [];
for (const combo of combos) {
  await createCombo({ name: combo.name, models: combo.models ?? [] });
}
console.log(`[migrate] Migrated ${combos.length} combos`);

// Migrate API keys
const apiKeys = (pickArray(data, "apiKeys") as Array<{ id: string; name: string; key: string; machineId?: string; isActive?: boolean; createdAt?: string }>) ?? [];
for (const k of apiKeys) {
  db.run(
    "INSERT OR IGNORE INTO api_keys (id, name, key, machine_id, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [k.id, k.name, k.key, k.machineId ?? null, k.isActive !== false ? 1 : 0, k.createdAt ?? new Date().toISOString()]
  );
}
console.log(`[migrate] Migrated ${apiKeys.length} API keys`);

// Migrate KV: settings, modelAliases, mitmAlias, pricing
const kv: Array<[string, unknown]> = [
  [KV_KEYS.SETTINGS,      data.settings      ?? {}],
  [KV_KEYS.MODEL_ALIASES, data.modelAliases   ?? {}],
  [KV_KEYS.MITM_ALIAS,    data.mitmAlias      ?? {}],
  [KV_KEYS.PRICING,       data.pricing        ?? {}],
];
for (const [key, value] of kv) {
  db.run(
    "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, JSON.stringify(value)]
  );
}
console.log("[migrate] Migrated settings, model aliases, mitm aliases, pricing");

console.log("[migrate] Done.");
