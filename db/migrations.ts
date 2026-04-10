/**
 * Migration system for SQLite schema
 * Tracks version in schema_version table and runs migrations in-place
 */

import type { Database } from "bun:sqlite";

export const CURRENT_SCHEMA_VERSION = 2;

export interface Migration {
  version: number;
  name: string;
  up: (db: Database) => void;
}

/**
 * Get current schema version from the database
 * Returns 0 if schema_version table doesn't exist (v1 schema)
 */
export function getSchemaVersion(db: Database): number {
  try {
    const row = db
      .query<{ version: number }, []>("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1")
      .get();
    return row?.version ?? 0;
  } catch {
    // schema_version table doesn't exist, this is v1
    return 1;
  }
}

/**
 * Run migrations to bring database up to current version
 */
export function runMigrations(db: Database): void {
  const currentVersion = getSchemaVersion(db);

  if (currentVersion === CURRENT_SCHEMA_VERSION) {
    return; // Already up to date
  }

  console.log(`[DB] Current schema version: ${currentVersion}, target: ${CURRENT_SCHEMA_VERSION}`);

  // Run migrations in order
  for (const migration of migrations) {
    if (migration.version > currentVersion && migration.version <= CURRENT_SCHEMA_VERSION) {
      console.log(`[DB] Running migration v${migration.version}: ${migration.name}`);
      db.run("BEGIN TRANSACTION");
      try {
        migration.up(db);
        // Record version
        db.run(
          "INSERT INTO schema_version (version, applied_at) VALUES (?, ?)",
          [migration.version, new Date().toISOString()]
        );
        db.run("COMMIT");
        console.log(`[DB] Migration v${migration.version} completed`);
      } catch (error) {
        db.exec("ROLLBACK");
        console.error(`[DB] Migration v${migration.version} failed:`, error);
        throw error;
      }
    }
  }
}

/**
 * Migration v2: Normalize JSON blobs into columnar tables
 * - provider_connections: extract JSON fields to columns
 * - proxy_pools: extract JSON fields to columns
 * - Create dedicated tables for kv data (settings, model_aliases, mitm_aliases, pricing, combo_configs)
 * - Drop kv table
 */
const migrationV2: Migration = {
  version: 2,
  name: "normalize-json-blobs",
  up: (db: Database) => {
    // Create schema_version table first (this table will exist in v2+)
    db.run(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      )
    `);

    // 1. Migrate provider_connections
    // Check if old schema exists
    const oldPCExists = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='provider_connections'"
      )
      .get();

    if (oldPCExists) {
      const pcColumns = db
        .query<{ sql: string }, []>("SELECT sql FROM sqlite_master WHERE type='table' AND name='provider_connections'")
        .get();

      // Check if using old JSON blob schema (data column exists)
      // Look for the actual column name in the schema - SQLite returns SQL with varying whitespace
      const isOldSchema = pcColumns?.sql.includes("data") && pcColumns?.sql.includes("TEXT") && !pcColumns?.sql.includes("display_name");

      if (isOldSchema) {
        console.log("[Migration v2] Migrating provider_connections from JSON blob to columnar");

        // Rename old table
        db.run("ALTER TABLE provider_connections RENAME TO provider_connections_old");

        // Create new columnar table
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
        db.run("CREATE INDEX IF NOT EXISTS idx_pc_provider ON provider_connections(provider)");
        db.run("CREATE INDEX IF NOT EXISTS idx_pc_is_active ON provider_connections(is_active)");

        // Migrate data from old table
        const oldRows = db
          .query<{ id: string; provider: string; data: string }, []>(
            "SELECT id, provider, data FROM provider_connections_old"
          )
          .all();

        for (const row of oldRows) {
          let data: Record<string, unknown>;
          try {
            data = JSON.parse(row.data) as Record<string, unknown>;
          } catch {
            data = {};
          }

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
              JSON.stringify(extractProviderSpecificData(data)),
              toStringOrNull(data.createdAt) ?? new Date().toISOString(),
              toStringOrNull(data.updatedAt) ?? new Date().toISOString(),
            ]
          );
        }

        console.log(`[Migration v2] Migrated ${oldRows.length} provider_connections`);

        // Drop old table
        db.run("DROP TABLE provider_connections_old");
      }
    } else {
      // New install - create the v2 table
      db.run(`
        CREATE TABLE IF NOT EXISTS provider_connections (
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
      db.run("CREATE INDEX IF NOT EXISTS idx_pc_provider ON provider_connections(provider)");
      db.run("CREATE INDEX IF NOT EXISTS idx_pc_is_active ON provider_connections(is_active)");
    }

    // 2. Migrate proxy_pools
    const oldPPExists = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='proxy_pools'"
      )
      .get();

    if (oldPPExists) {
      const ppColumns = db
        .query<{ sql: string }, []>("SELECT sql FROM sqlite_master WHERE type='table' AND name='proxy_pools'")
        .get();

      // Check if using old JSON blob schema (data column exists)
      const isOldSchema = ppColumns?.sql.includes("data") && ppColumns?.sql.includes("TEXT") && !ppColumns?.sql.includes("proxy_url");

      if (isOldSchema) {
        console.log("[Migration v2] Migrating proxy_pools from JSON blob to columnar");

        db.run("ALTER TABLE proxy_pools RENAME TO proxy_pools_old");

        db.run(`
          CREATE TABLE proxy_pools (
            id              TEXT PRIMARY KEY,
            name            TEXT,
            proxy_url       TEXT,
            no_proxy        TEXT,
            is_active       INTEGER DEFAULT 1,
            strict_proxy    INTEGER DEFAULT 0,
            test_status     TEXT,
            last_tested_at  TEXT,
            last_error      TEXT,
            created_at      TEXT,
            updated_at      TEXT
          )
        `);

        const oldRows = db
          .query<{ id: string; data: string }, []>("SELECT id, data FROM proxy_pools_old")
          .all();

        for (const row of oldRows) {
          let data: Record<string, unknown>;
          try {
            data = JSON.parse(row.data) as Record<string, unknown>;
          } catch {
            data = {};
          }

          db.run(
            `INSERT INTO proxy_pools (
              id, name, proxy_url, no_proxy, is_active, strict_proxy,
              test_status, last_tested_at, last_error, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              row.id,
              toStringOrNull(data.name),
              toStringOrNull(data.proxyUrl),
              toStringOrNull(data.noProxy),
              toBool(data.isActive) ? 1 : 0,
              toBool(data.strictProxy) ? 1 : 0,
              toStringOrNull(data.testStatus),
              toStringOrNull(data.lastTestedAt),
              toStringOrNull(data.lastError),
              toStringOrNull(data.createdAt),
              toStringOrNull(data.updatedAt),
            ]
          );
        }

        console.log(`[Migration v2] Migrated ${oldRows.length} proxy_pools`);

        db.run("DROP TABLE proxy_pools_old");
      }
    } else {
      // New install - create the v2 table
      db.run(`
        CREATE TABLE IF NOT EXISTS proxy_pools (
          id              TEXT PRIMARY KEY,
          name            TEXT,
          proxy_url       TEXT,
          no_proxy        TEXT,
          is_active       INTEGER DEFAULT 1,
          strict_proxy    INTEGER DEFAULT 0,
          test_status     TEXT,
          last_tested_at  TEXT,
          last_error      TEXT,
          created_at      TEXT,
          updated_at      TEXT
        )
      `);
    }

    // 3. Create new tables to replace KV
    // settings
    db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    // model_aliases
    db.run(`
      CREATE TABLE IF NOT EXISTS model_aliases (
        alias TEXT PRIMARY KEY,
        model TEXT NOT NULL
      )
    `);

    // mitm_aliases
    db.run(`
      CREATE TABLE IF NOT EXISTS mitm_aliases (
        tool_name TEXT NOT NULL,
        alias     TEXT NOT NULL,
        model     TEXT NOT NULL,
        PRIMARY KEY (tool_name, alias)
      )
    `);

    // pricing
    db.run(`
      CREATE TABLE IF NOT EXISTS pricing (
        provider TEXT NOT NULL,
        model    TEXT NOT NULL,
        input    REAL NOT NULL DEFAULT 0,
        output   REAL NOT NULL DEFAULT 0,
        PRIMARY KEY (provider, model)
      )
    `);

    // combo_configs
    db.run(`
      CREATE TABLE IF NOT EXISTS combo_configs (
        combo_name TEXT NOT NULL,
        model      TEXT NOT NULL,
        weight     REAL DEFAULT 1,
        PRIMARY KEY (combo_name, model)
      )
    `);

    // 4. Migrate data from kv table to new tables
    const kvExists = db
      .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='table' AND name='kv'")
      .get();

    if (kvExists) {
      console.log("[Migration v2] Migrating KV data to dedicated tables");

      // Migrate settings
      const settingsRow = db
        .query<{ value: string }, []>("SELECT value FROM kv WHERE key = 'settings'")
        .get();
      if (settingsRow) {
        try {
          const settings = JSON.parse(settingsRow.value) as Record<string, unknown>;
          for (const [key, value] of Object.entries(settings)) {
            db.run(
              "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
              [key, JSON.stringify(value)]
            );
          }
          console.log(`[Migration v2] Migrated ${Object.keys(settings).length} settings`);
        } catch {
          console.warn("[Migration v2] Failed to parse settings");
        }
      }

      // Migrate model_aliases
      const aliasesRow = db
        .query<{ value: string }, []>("SELECT value FROM kv WHERE key = 'model_aliases'")
        .get();
      if (aliasesRow) {
        try {
          const aliases = JSON.parse(aliasesRow.value) as Record<string, string>;
          for (const [alias, model] of Object.entries(aliases)) {
            db.run("INSERT OR REPLACE INTO model_aliases (alias, model) VALUES (?, ?)", [alias, model]);
          }
          console.log(`[Migration v2] Migrated ${Object.keys(aliases).length} model aliases`);
        } catch {
          console.warn("[Migration v2] Failed to parse model_aliases");
        }
      }

      // Migrate mitm_aliases
      const mitmRow = db
        .query<{ value: string }, []>("SELECT value FROM kv WHERE key = 'mitm_alias'")
        .get();
      if (mitmRow) {
        try {
          const mitmAlias = JSON.parse(mitmRow.value) as Record<string, Record<string, string>>;
          for (const [toolName, aliases] of Object.entries(mitmAlias)) {
            for (const [alias, model] of Object.entries(aliases as Record<string, string>)) {
              db.run(
                "INSERT OR REPLACE INTO mitm_aliases (tool_name, alias, model) VALUES (?, ?, ?)",
                [toolName, alias, model]
              );
            }
          }
          console.log(`[Migration v2] Migrated mitm aliases`);
        } catch {
          console.warn("[Migration v2] Failed to parse mitm_alias");
        }
      }

      // Migrate pricing
      const pricingRow = db
        .query<{ value: string }, []>("SELECT value FROM kv WHERE key = 'pricing'")
        .get();
      if (pricingRow) {
        try {
          const pricing = JSON.parse(pricingRow.value) as Record<
            string,
            Record<string, { input: number; output: number }>
          >;
          for (const [provider, models] of Object.entries(pricing)) {
            for (const [model, prices] of Object.entries(models)) {
              db.run(
                "INSERT OR REPLACE INTO pricing (provider, model, input, output) VALUES (?, ?, ?, ?)",
                [provider, model, prices.input ?? 0, prices.output ?? 0]
              );
            }
          }
          console.log(`[Migration v2] Migrated pricing data`);
        } catch {
          console.warn("[Migration v2] Failed to parse pricing");
        }
      }

      // Migrate combo_configs
      const configsRow = db
        .query<{ value: string }, []>("SELECT value FROM kv WHERE key = 'combo_configs'")
        .get();
      if (configsRow) {
        try {
          const configs = JSON.parse(configsRow.value) as Record<
            string,
            { models: Array<{ model: string; weight: number }> }
          >;
          for (const [comboName, config] of Object.entries(configs)) {
            for (const item of config.models ?? []) {
              db.run(
                "INSERT OR REPLACE INTO combo_configs (combo_name, model, weight) VALUES (?, ?, ?)",
                [comboName, item.model, item.weight ?? 1]
              );
            }
          }
          console.log(`[Migration v2] Migrated combo configs`);
        } catch {
          console.warn("[Migration v2] Failed to parse combo_configs");
        }
      }

      // Drop the old kv table
      console.log("[Migration v2] Dropping kv table");
      db.run("DROP TABLE kv");
    }
  },
};

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

// All migrations in order
export const migrations: Migration[] = [migrationV2];
