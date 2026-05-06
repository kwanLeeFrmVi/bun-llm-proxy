/**
 * Migration system for SQLite schema
 * Tracks version in schema_version table and runs migrations in-place
 */

import type { Database } from "bun:sqlite";
import { PRICING_SEED_ENTRIES } from "../lib/pricing.ts";

export const CURRENT_SCHEMA_VERSION = 6;

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
      .query<
        { version: number },
        []
      >("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1")
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
        db.run("INSERT INTO schema_version (version, applied_at) VALUES (?, ?)", [
          migration.version,
          new Date().toISOString(),
        ]);
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
      .query<
        { name: string },
        []
      >("SELECT name FROM sqlite_master WHERE type='table' AND name='provider_connections'")
      .get();

    if (oldPCExists) {
      const pcColumns = db
        .query<
          { sql: string },
          []
        >("SELECT sql FROM sqlite_master WHERE type='table' AND name='provider_connections'")
        .get();

      // Check if using old JSON blob schema (data column exists)
      // Look for the actual column name in the schema - SQLite returns SQL with varying whitespace
      const isOldSchema =
        pcColumns?.sql.includes("data") &&
        pcColumns?.sql.includes("TEXT") &&
        !pcColumns?.sql.includes("display_name");

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
          .query<
            { id: string; provider: string; data: string },
            []
          >("SELECT id, provider, data FROM provider_connections_old")
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
      .query<
        { name: string },
        []
      >("SELECT name FROM sqlite_master WHERE type='table' AND name='proxy_pools'")
      .get();

    if (oldPPExists) {
      const ppColumns = db
        .query<
          { sql: string },
          []
        >("SELECT sql FROM sqlite_master WHERE type='table' AND name='proxy_pools'")
        .get();

      // Check if using old JSON blob schema (data column exists)
      const isOldSchema =
        ppColumns?.sql.includes("data") &&
        ppColumns?.sql.includes("TEXT") &&
        !ppColumns?.sql.includes("proxy_url");

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
      .query<
        { name: string },
        []
      >("SELECT name FROM sqlite_master WHERE type='table' AND name='kv'")
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
            db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
              key,
              JSON.stringify(value),
            ]);
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
            db.run("INSERT OR REPLACE INTO model_aliases (alias, model) VALUES (?, ?)", [
              alias,
              model,
            ]);
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

/**
 * Migration v3: Migrate enabled models from connection-specific to provider-level storage
 *
 * Previously, custom models were stored in provider_connections.provider_specific_data.enabledModels
 * Now they are stored in settings table with key pattern "providerEnabledModels:{providerId}"
 *
 * This migration:
 * 1. Finds all connections with enabledModels in provider_specific_data
 * 2. Extracts the nodeName to identify the provider
 * 3. Migrates enabledModels to settings table with key "providerEnabledModels:{nodeName}"
 * 4. Uses INSERT OR IGNORE to avoid overwriting existing provider-level models
 */
const migrationV3: Migration = {
  version: 3,
  name: "migrate-enabled-models-to-provider-level",
  up: (db: Database) => {
    console.log("[Migration v3] Starting enabled models migration...");

    // Get all connections with enabledModels in provider_specific_data
    const connections = db
      .query<{ id: string; provider_specific_data: string }, []>(
        `SELECT id, provider_specific_data FROM provider_connections
         WHERE provider_specific_data IS NOT NULL
         AND provider_specific_data LIKE '%enabledModels%'`
      )
      .all();

    if (connections.length === 0) {
      console.log("[Migration v3] No connections with enabledModels found, skipping.");
      return;
    }

    let migratedCount = 0;
    const providerModels = new Map<string, string[]>();

    // First, collect all enabled models by provider (nodeName)
    for (const conn of connections) {
      let psd: Record<string, unknown>;
      try {
        psd = JSON.parse(conn.provider_specific_data) as Record<string, unknown>;
      } catch {
        continue;
      }

      const enabledModels = psd.enabledModels;
      const nodeName = typeof psd.nodeName === "string" ? psd.nodeName : null;

      if (!nodeName || !Array.isArray(enabledModels) || enabledModels.length === 0) {
        continue;
      }

      // Filter to ensure we have strings only
      const modelIds = enabledModels.filter(
        (m): m is string => typeof m === "string" && m.trim() !== ""
      );

      if (modelIds.length === 0) {
        continue;
      }

      // Merge models for this provider (deduplicate)
      const existing = providerModels.get(nodeName) ?? [];
      const merged = [...new Set([...existing, ...modelIds])];
      providerModels.set(nodeName, merged);
    }

    // Now insert into settings table
    for (const [nodeName, modelIds] of providerModels.entries()) {
      const key = `providerEnabledModels:${nodeName}`;

      // Check if already exists (don't overwrite)
      const existing = db
        .query<{ value: string }, [string]>("SELECT value FROM settings WHERE key = ?")
        .get(key);

      if (existing) {
        console.log(
          `[Migration v3] Provider ${nodeName} already has provider-level models, skipping.`
        );
        continue;
      }

      // Insert new entry
      db.run("INSERT INTO settings (key, value) VALUES (?, ?)", [key, JSON.stringify(modelIds)]);

      console.log(
        `[Migration v3] Migrated ${modelIds.length} models for provider "${nodeName}":`,
        modelIds
      );
      migratedCount++;
    }

    console.log(`[Migration v3] Completed: migrated ${migratedCount} providers.`);
  },
};

/**
 * Migration v4: Add streaming performance metrics to usage_log
 * - streaming: boolean flag indicating if request was streaming
 * - ttft_ms: time to first token in milliseconds (streaming only)
 * - tokens_per_second: generation speed (streaming only)
 * - New index on (model, timestamp) for per-model stats queries
 */
const migrationV4: Migration = {
  version: 4,
  name: "add-streaming-metrics",
  up: (db: Database) => {
    console.log("[Migration v4] Adding streaming performance columns to usage_log");

    db.run("ALTER TABLE usage_log ADD COLUMN streaming INTEGER DEFAULT 0");
    db.run("ALTER TABLE usage_log ADD COLUMN ttft_ms INTEGER");
    db.run("ALTER TABLE usage_log ADD COLUMN tokens_per_second REAL");
    db.run("CREATE INDEX IF NOT EXISTS idx_usage_model ON usage_log(model, timestamp)");

    console.log("[Migration v4] Completed: streaming metrics columns added");
  },
};

/**
 * Migration v5: Seed pricing for custom models not available in OpenRouter.
 * These models (Claudible custom models, MiniMax variants) need hardcoded
 * pricing entries since they don't exist in the OpenRouter pricing feed.
 * Values are per 1M tokens ($/1M).
 */
const migrationV5: Migration = {
  version: 5,
  name: "seed-custom-model-pricing",
  up: (db: Database) => {
    console.log("[Migration v5] Seeding pricing for custom models not in OpenRouter");

    // Ensure pricing table exists (defensive — may have been dropped or schema was modified)
    db.run(`
      CREATE TABLE IF NOT EXISTS pricing (
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        input REAL NOT NULL DEFAULT 0,
        output REAL NOT NULL DEFAULT 0,
        PRIMARY KEY (provider, model)
      )
    `);

    // Seed entries imported from lib/pricing.ts (single source of truth)

    let seededCount = 0;
    for (const entry of PRICING_SEED_ENTRIES) {
      try {
        db.run(
          "INSERT INTO pricing (provider, model, input, output) VALUES (?, ?, ?, ?) ON CONFLICT(provider, model) DO NOTHING",
          [entry.provider, entry.model, entry.input, entry.output]
        );
        seededCount++;
      } catch (err) {
        console.error(`[Migration v5] Failed to seed pricing for ${entry.provider}/${entry.model}:`, err);
      }
    }

    console.log(`[Migration v5] Completed: seeded ${seededCount} pricing entries`);
  },
};

/**
 * Migration v6: Recalculate costs for usage_log entries that have tokens but cost=0.
 * This fixes historical data after v5 seeded the missing pricing entries.
 */
const migrationV6: Migration = {
  version: 6,
  name: "recalculate-zero-cost-usage",
  up: (db: Database) => {
    console.log("[Migration v6] Recalculating zero-cost usage_log entries");

    // Defensive: skip if usage_log doesn't exist (shouldn't happen, but safe)
    const tableCheck = db
      .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='table' AND name='usage_log'")
      .get();
    if (!tableCheck) {
      console.log("[Migration v6] usage_log table not found, skipping");
      return;
    }

    // ── Inline helpers (avoid circular import from services/pricingSync.ts) ──
    const STRIP_SUFFIXES = [
      "-turbo", "-maas", "-fast", "-ultra", "-large", "-mini",
      "-hd", "-code", "-instruct", "-preview", "-latest", ":cloud", "-highspeed",
    ];

    function stripProviderPrefix(name: string): string {
      return name.includes("/") ? name.split("/").slice(1).join("/") : name;
    }

    function normalizeModelName(model: string): string {
      let name = stripProviderPrefix(model);
      name = name.replace(/(\d+)\.(\d+)/g, "$1-$2");
      for (const suffix of STRIP_SUFFIXES) {
        if (name.toLowerCase().endsWith(suffix)) {
          name = name.slice(0, -suffix.length);
        }
      }
      name = name.replace(/-?\d{8,14}$/, "");
      return name;
    }

    function stripSuffixes(model: string): string {
      let name = model;
      for (const suffix of STRIP_SUFFIXES) {
        if (name.toLowerCase().endsWith(suffix)) {
          name = name.slice(0, -suffix.length);
        }
      }
      return name;
    }

    function baseModelName(model: string): string {
      const normalized = normalizeModelName(model);
      const knownBases = [
        "claude-opus", "claude-sonnet", "claude-haiku",
        "gpt-4", "gpt-3.5", "glm-5", "minimax",
      ];
      for (const b of knownBases) {
        if (normalized.toLowerCase().startsWith(b)) return b;
      }
      const idx = normalized.lastIndexOf("-");
      if (idx > 0) {
        const candidate = normalized.slice(0, idx);
        if (candidate.length > 2) return candidate;
      }
      return normalized;
    }

    // Hardcoded fallback (mirrors lib/pricing.ts FALLBACK_PRICING)
    const FALLBACK_PRICING: Record<string, { input: number; output: number }> = {
      "claude-opus-4-7": { input: 5, output: 25 },
      "claudible-claude-opus-4-7": { input: 5, output: 25 },
      "claudible-claude-sonnet-4-6": { input: 3, output: 15 },
      "claudible-claude-haiku-4-5-20251001": { input: 0.25, output: 1.25 },
      "claude-sonnet-4-6": { input: 3, output: 15 },
      "claude-opus-4-6": { input: 5, output: 25 },
      "minimax-m2-7": { input: 0.5, output: 2 },
      "minimax-m2-5": { input: 0.5, output: 2 },
      "minimax-m2-1": { input: 0.5, output: 2 },
      "MiniMax-M2-7": { input: 0.5, output: 2 },
      "MiniMax-M2-5": { input: 0.5, output: 2 },
      "MiniMax-M2-1": { input: 0.5, output: 2 },
    };

    // ── Build pricing map from DB ──
    const pricingRows = db
      .query<{ provider: string; model: string; input: number; output: number }, []>(
        "SELECT provider, model, input, output FROM pricing"
      )
      .all();

    const pricing: Record<string, Record<string, { input: number; output: number }>> = {};
    for (const row of pricingRows) {
      if (!pricing[row.provider]) pricing[row.provider] = {};
      pricing[row.provider]![row.model] = { input: row.input, output: row.output };
    }

    // ── Find zero-cost entries ──
    const entries = db
      .query<
        { id: string; provider: string; model: string; prompt_tokens: number; completion_tokens: number },
        []
      >(
        `SELECT id, provider, model, prompt_tokens, completion_tokens
         FROM usage_log
         WHERE cost = 0 AND (prompt_tokens > 0 OR completion_tokens > 0)`
      )
      .all();

    console.log(`[Migration v6] Found ${entries.length} entries to recalculate`);

    let updated = 0;
    let notFound = 0;

    for (const entry of entries) {
      const { id, provider, model, prompt_tokens, completion_tokens } = entry;
      const normalized = normalizeModelName(model);
      const stripped = stripSuffixes(model);
      const base = baseModelName(model);

      let cost = 0;
      let found = false;

      // 1. Exact match
      if (pricing[provider]?.[model]) {
        const p = pricing[provider]![model]!;
        cost = (prompt_tokens * p.input) / 1_000_000 + (completion_tokens * p.output) / 1_000_000;
        found = true;
      }
      // 2. Normalized match
      else if (pricing[provider]?.[normalized]) {
        const p = pricing[provider]![normalized]!;
        cost = (prompt_tokens * p.input) / 1_000_000 + (completion_tokens * p.output) / 1_000_000;
        found = true;
      }
      // 3. Stripped match
      else if (pricing[provider]?.[stripped]) {
        const p = pricing[provider]![stripped]!;
        cost = (prompt_tokens * p.input) / 1_000_000 + (completion_tokens * p.output) / 1_000_000;
        found = true;
      }
      // 4. Base model match
      else if (pricing[provider]?.[base]) {
        const p = pricing[provider]![base]!;
        cost = (prompt_tokens * p.input) / 1_000_000 + (completion_tokens * p.output) / 1_000_000;
        found = true;
      }
      // 5. openrouter provider fallback
      else if (pricing.openrouter) {
        for (const [key, value] of Object.entries(pricing.openrouter)) {
          if (
            key === model ||
            key === normalized ||
            key === stripped ||
            key === base ||
            normalizeModelName(key) === normalized
          ) {
            cost = (prompt_tokens * value.input) / 1_000_000 + (completion_tokens * value.output) / 1_000_000;
            found = true;
            break;
          }
        }
      }

      // 6. Hardcoded fallback
      if (!found) {
        for (const key of [model, normalized, stripped, base]) {
          const entry = FALLBACK_PRICING[key];
          if (entry) {
            cost = (prompt_tokens * entry.input) / 1_000_000 + (completion_tokens * entry.output) / 1_000_000;
            found = true;
            break;
          }
        }
      }

      if (found && cost > 0) {
        db.run("UPDATE usage_log SET cost = ? WHERE id = ?", [cost, id]);
        updated++;
      } else {
        notFound++;
      }
    }

    console.log(`[Migration v6] Updated ${updated} entries, ${notFound} still without pricing`);
  },
};

// All migrations in order
export const migrations: Migration[] = [migrationV2, migrationV3, migrationV4, migrationV5, migrationV6];
