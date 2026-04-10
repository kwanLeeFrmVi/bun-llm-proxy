/**
 * Fix database schema issues
 * - Detects and fixes schema_version mismatch
 * - Migrates old JSON blob schema to new columnar schema
 * - Imports data from db.json if tables are empty
 * - Adds missing model aliases for combos
 *
 * Run: bun run db/fix-schema.ts
 */

import { join } from "node:path";
import { homedir } from "node:os";
import { openDb, closeDb } from "./index.ts";

const DATA_DIR = process.env.DATA_DIR ?? join(homedir(), ".bunLLM");
const DB_PATH = join(DATA_DIR, "router.db");
const DB_JSON_PATH = join(DATA_DIR, "db.json");

// Helper functions
function toStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

function toInt(value: unknown, defaultValue: number = 0): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }
  return defaultValue;
}

function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    return value.toLowerCase() === "true" || value === "1";
  }
  return false;
}

function extractProviderSpecificData(
  data: Record<string, unknown>
): Record<string, unknown> {
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

async function main() {
  console.log(`[FIX] Database: ${DB_PATH}`);
  console.log(`[FIX] db.json: ${DB_JSON_PATH}`);

  const db = openDb();

  // 1. Check schema_version
  let schemaVersion = 0;
  try {
    const row = db
      .query<{ version: number }, []>("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1")
      .get();
    schemaVersion = row?.version ?? 0;
  } catch {
    console.log("[FIX] No schema_version table found");
  }
  console.log(`[FIX] Current schema version: ${schemaVersion}`);

  // 2. Check provider_connections schema
  const pcTable = db
    .query<{ sql: string }, []>("SELECT sql FROM sqlite_master WHERE type='table' AND name='provider_connections'")
    .get();

  const hasNameColumn = pcTable?.sql?.includes("name TEXT") ?? false;
  const hasDataColumn = pcTable?.sql?.includes("data TEXT") ?? false;

  console.log(`[FIX] provider_connections has 'name' column: ${hasNameColumn}`);
  console.log(`[FIX] provider_connections has 'data' column: ${hasDataColumn}`);

  // 3. Fix provider_connections if needed
  if (hasDataColumn && !hasNameColumn) {
    console.log("[FIX] Migrating provider_connections from JSON blob to columnar...");

    db.run("BEGIN TRANSACTION");

    try {
      // Backup existing data
      const oldRows = db
        .query<{ id: string; provider: string; data: string }, []>(
          "SELECT id, provider, data FROM provider_connections"
        )
        .all();

      console.log(`[FIX] Backing up ${oldRows.length} rows...`);

      // Drop old table
      db.run("DROP TABLE provider_connections");

      // Create new table
      db.run(`
        CREATE TABLE provider_connections (
          id                    TEXT PRIMARY KEY,
          provider              TEXT NOT NULL,
          name                  TEXT,
          display_name          TEXT,
          email                 TEXT,
          auth_type             TEXT,
          api_key               TEXT,
          access_token          TEXT,
          refresh_token         TEXT,
          id_token              TEXT,
          expires_at            TEXT,
          project_id            TEXT,
          priority              INTEGER DEFAULT 1,
          is_active             INTEGER DEFAULT 1,
          test_status           TEXT DEFAULT 'unknown',
          last_error            TEXT,
          error_code            INTEGER,
          last_error_at         TEXT,
          backoff_level         INTEGER DEFAULT 0,
          last_used_at          TEXT,
          consecutive_use_count INTEGER DEFAULT 0,
          provider_specific_data TEXT,
          created_at            TEXT NOT NULL,
          updated_at            TEXT NOT NULL
        )
      `);

      // Migrate data
      for (const row of oldRows) {
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(row.data) as Record<string, unknown>;
        } catch {
          data = {};
        }

        const psd = extractProviderSpecificData(data);

        db.run(
          `INSERT INTO provider_connections (
            id, provider, name, display_name, email, auth_type, api_key,
            access_token, refresh_token, id_token, expires_at, project_id,
            priority, is_active, test_status, last_error, error_code, last_error_at,
            backoff_level, last_used_at, consecutive_use_count, provider_specific_data,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.id,
            row.provider,
            toStringOrNull(data.name),
            toStringOrNull(data.displayName),
            toStringOrNull(data.email),
            toStringOrNull(data.authType),
            toStringOrNull(data.apiKey),
            toStringOrNull(data.accessToken),
            toStringOrNull(data.refreshToken),
            toStringOrNull(data.idToken),
            toStringOrNull(data.expiresAt),
            toStringOrNull(data.projectId),
            toInt(data.priority, 1),
            toBool(data.isActive) ? 1 : 0,
            toStringOrNull(data.testStatus) ?? "unknown",
            toStringOrNull(data.lastError),
            toInt(data.errorCode),
            toStringOrNull(data.lastErrorAt),
            toInt(data.backoffLevel, 0),
            toStringOrNull(data.lastUsedAt),
            toInt(data.consecutiveUseCount, 0),
            JSON.stringify(psd),
            toStringOrNull(data.createdAt) ?? new Date().toISOString(),
            toStringOrNull(data.updatedAt) ?? new Date().toISOString(),
          ]
        );
      }

      // Create indexes
      db.run("CREATE INDEX IF NOT EXISTS idx_pc_provider ON provider_connections(provider)");
      db.run("CREATE INDEX IF NOT EXISTS idx_pc_is_active ON provider_connections(is_active)");

      db.run("COMMIT");
      console.log(`[FIX] Migrated ${oldRows.length} provider_connections`);
    } catch (error) {
      db.run("ROLLBACK");
      console.error("[FIX] Migration failed:", error);
      throw error;
    }
  }

  // 4. Check if data needs to be imported from db.json
  const pcCount = db.query<{ count: number }, []>("SELECT COUNT(*) as count FROM provider_connections").get();
  console.log(`[FIX] provider_connections count: ${pcCount?.count ?? 0}`);

  if ((pcCount?.count ?? 0) === 0) {
    console.log("[FIX] No provider connections found, checking db.json...");

    try {
      const file = Bun.file(DB_JSON_PATH);
      if (!(await file.exists())) {
        console.log(`[FIX] No db.json found at ${DB_JSON_PATH}`);
        console.log("[FIX] Skipping data import");
      } else {
        const data = await file.json() as Record<string, unknown>;
        console.log(`[FIX] Found db.json with keys: ${Object.keys(data).join(", ")}`);

        // Import provider connections
        const connections = (data.providerConnections as Array<Record<string, unknown>>) || [];
        if (connections.length > 0) {
          console.log(`[FIX] Importing ${connections.length} provider connections...`);

          for (const conn of connections) {
            const psd = (conn.providerSpecificData as Record<string, unknown>) || extractProviderSpecificData(conn);

            db.run(
              `INSERT INTO provider_connections (
                id, provider, name, display_name, email, auth_type, api_key,
                access_token, refresh_token, id_token, expires_at, project_id,
                priority, is_active, test_status, last_error, error_code, last_error_at,
                backoff_level, last_used_at, consecutive_use_count, provider_specific_data,
                created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                toStringOrNull(conn.id),
                toStringOrNull(conn.provider),
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
                toInt(conn.errorCode),
                toStringOrNull(conn.lastErrorAt),
                toInt(conn.backoffLevel, 0),
                toStringOrNull(conn.lastUsedAt),
                toInt(conn.consecutiveUseCount, 0),
                JSON.stringify(psd),
                toStringOrNull(conn.createdAt) ?? new Date().toISOString(),
                toStringOrNull(conn.updatedAt) ?? new Date().toISOString(),
              ]
            );
          }
          console.log(`[FIX] Imported ${connections.length} provider connections`);
        }

        // Import provider nodes
        const nodes = (data.providerNodes as Array<Record<string, unknown>>) || [];
        for (const node of nodes) {
          const exists = db.query("SELECT 1 FROM provider_nodes WHERE id = ?", [node.id]).get();
          if (!exists) {
            db.run(
              "INSERT INTO provider_nodes (id, type, name, prefix, api_type, base_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
              [
                toStringOrNull(node.id),
                toStringOrNull(node.type),
                toStringOrNull(node.name),
                toStringOrNull(node.prefix),
                toStringOrNull((node.apiType as string) ?? (node.api_type as string)),
                toStringOrNull((node.baseUrl as string) ?? (node.base_url as string)),
                toStringOrNull(node.createdAt) ?? new Date().toISOString(),
                toStringOrNull(node.updatedAt) ?? new Date().toISOString(),
              ]
            );
          }
        }
        console.log(`[FIX] Imported ${nodes.length} provider nodes`);

        // Import proxy pools
        const pools = (data.proxyPools as Array<Record<string, unknown>>) || [];
        for (const pool of pools) {
          const exists = db.query("SELECT 1 FROM proxy_pools WHERE id = ?", [pool.id]).get();
          if (!exists) {
            db.run(
              `INSERT INTO proxy_pools (id, name, proxy_url, no_proxy, is_active, strict_proxy, test_status, last_tested_at, last_error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                pool.id,
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
        }
        console.log(`[FIX] Imported ${pools.length} proxy pools`);

        // Import combos
        const combos = (data.combos as Array<{ name: string; models: string[]; id?: string }>) || [];
        for (const combo of combos) {
          const exists = db.query("SELECT 1 FROM combos WHERE name = ?", [combo.name]).get();
          if (!exists) {
            const id = combo.id || crypto.randomUUID();
            db.run(
              "INSERT INTO combos (id, name, models, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
              [id, combo.name, JSON.stringify(combo.models || []), new Date().toISOString(), new Date().toISOString()]
            );
          }
        }
        console.log(`[FIX] Imported ${combos.length} combos`);

        // Import settings
        const settings = (data.settings as Record<string, unknown>) || {};
        for (const [key, value] of Object.entries(settings)) {
          db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, JSON.stringify(value)]);
        }
        console.log(`[FIX] Imported ${Object.keys(settings).length} settings`);

        // Import model aliases
        const modelAliases = (data.modelAliases as Record<string, string>) || {};
        for (const [alias, model] of Object.entries(modelAliases)) {
          db.run("INSERT OR REPLACE INTO model_aliases (alias, model) VALUES (?, ?)", [alias, model]);
        }
        console.log(`[FIX] Imported ${Object.keys(modelAliases).length} model aliases`);

        // Import MITM aliases
        const mitmAlias = (data.mitmAlias as Record<string, Record<string, string>>) || {};
        for (const [toolName, aliases] of Object.entries(mitmAlias)) {
          for (const [alias, model] of Object.entries(aliases)) {
            db.run("INSERT OR REPLACE INTO mitm_aliases (tool_name, alias, model) VALUES (?, ?, ?)", [toolName, alias, model]);
          }
        }
        console.log(`[FIX] Imported MITM aliases`);

        // Import pricing
        const pricing = (data.pricing as Record<string, Record<string, { input: number; output: number }>>) || {};
        for (const [provider, models] of Object.entries(pricing)) {
          for (const [model, prices] of Object.entries(models)) {
            db.run("INSERT OR REPLACE INTO pricing (provider, model, input, output) VALUES (?, ?, ?, ?)",
              [provider, model, prices.input ?? 0, prices.output ?? 0]);
          }
        }
        console.log(`[FIX] Imported pricing data`);

        // Import combo configs
        const comboConfigs = (data.comboConfigs as Record<string, { models: Array<{ model: string; weight: number }> }>) || {};
        for (const [comboName, config] of Object.entries(comboConfigs)) {
          for (const item of config.models || []) {
            db.run("INSERT OR REPLACE INTO combo_configs (combo_name, model, weight) VALUES (?, ?, ?)",
              [comboName, item.model, item.weight ?? 1]);
          }
        }
        console.log(`[FIX] Imported combo configs`);

        // Import API keys
        const apiKeys = (data.apiKeys as Array<{ id: string; name: string; key: string; machineId?: string; isActive?: boolean; createdAt?: string }>) || [];
        for (const k of apiKeys) {
          db.run(
            "INSERT INTO api_keys (id, name, key, machine_id, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            [k.id, k.name, k.key, k.machineId ?? null, k.isActive !== false ? 1 : 0, k.createdAt ?? new Date().toISOString()]
          );
        }
        console.log(`[FIX] Imported ${apiKeys.length} API keys`);
      }
    } catch (error) {
      console.error("[FIX] Error importing from db.json:", error);
    }
  }

  // 5. Fix missing model aliases for combos
  console.log("[FIX] Checking for missing model aliases...");

  const combos = db
    .query<{ name: string; models: string }, []>("SELECT name, models FROM combos")
    .all();

  for (const combo of combos) {
    try {
      const models = JSON.parse(combo.models) as string[];
      for (const model of models) {
        // Convert prefix/model to prefix-model for alias lookup
        if (model.includes("/")) {
          const [prefix, ...rest] = model.split("/");
          const alias = `${prefix}-${rest.join("-")}`;

          const exists = db.query("SELECT 1 FROM model_aliases WHERE alias = ?", [alias]).get();
          if (!exists) {
            console.log(`[FIX] Missing alias: ${alias} (for combo ${combo.name})`);
            // We can't auto-fix this without knowing the target provider/model
            console.log(`[FIX] Run this query manually if needed:`);
            console.log(`[FIX] INSERT INTO model_aliases (alias, model) VALUES ('${alias}', '<provider-id>/<model>');`);
          }
        }
      }
    } catch {
      // Skip invalid JSON
    }
  }

  // 6. Ensure schema_version is correct
  if (schemaVersion === 0) {
    console.log("[FIX] Setting schema_version to 2...");
    db.run("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
    db.run("INSERT INTO schema_version (version, applied_at) VALUES (?, ?)", [2, new Date().toISOString()]);
  }

  console.log("[FIX] Done!");
  closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
