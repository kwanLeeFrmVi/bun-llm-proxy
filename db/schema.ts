// SQLite schema v2 for bun-runtime
// Normalized schema: dedicated columns instead of JSON blobs

// ─── V2 Schema (current) ─────────────────────────────────────────────────────────

export const CREATE_TABLES_V2 = `
  -- Provider connections: fully columnar (no JSON blob)
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
  );
  CREATE INDEX IF NOT EXISTS idx_pc_provider ON provider_connections(provider);
  CREATE INDEX IF NOT EXISTS idx_pc_is_active ON provider_connections(is_active);

  -- Provider nodes: already columnar, unchanged
  CREATE TABLE IF NOT EXISTS provider_nodes (
    id         TEXT PRIMARY KEY,
    type       TEXT,
    name       TEXT,
    prefix     TEXT,
    api_type   TEXT,
    base_url   TEXT,
    created_at TEXT,
    updated_at TEXT
  );

  -- Proxy pools: fully columnar (no JSON blob)
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
  );

  -- Combos: already columnar, unchanged
  CREATE TABLE IF NOT EXISTS combos (
    id         TEXT PRIMARY KEY,
    name       TEXT UNIQUE NOT NULL,
    models     TEXT NOT NULL,
    created_at TEXT,
    updated_at TEXT
  );

  -- API keys: already columnar, unchanged
  CREATE TABLE IF NOT EXISTS api_keys (
    id         TEXT PRIMARY KEY,
    name       TEXT,
    key        TEXT UNIQUE,
    machine_id TEXT,
    is_active  INTEGER DEFAULT 1,
    created_at TEXT,
    user_id    TEXT
  );

  -- Settings: key/value pairs (replaces kv.settings)
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- Model aliases: dedicated table (replaces kv.model_aliases)
  CREATE TABLE IF NOT EXISTS model_aliases (
    alias TEXT PRIMARY KEY,
    model TEXT NOT NULL
  );

  -- MITM aliases: dedicated table (replaces kv.mitm_alias)
  CREATE TABLE IF NOT EXISTS mitm_aliases (
    tool_name TEXT NOT NULL,
    alias     TEXT NOT NULL,
    model     TEXT NOT NULL,
    PRIMARY KEY (tool_name, alias)
  );

  -- Pricing: dedicated table (replaces kv.pricing)
  CREATE TABLE IF NOT EXISTS pricing (
    provider TEXT NOT NULL,
    model    TEXT NOT NULL,
    input    REAL NOT NULL DEFAULT 0,
    output   REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (provider, model)
  );

  -- Combo configs: dedicated table (replaces kv.combo_configs)
  CREATE TABLE IF NOT EXISTS combo_configs (
    combo_name TEXT NOT NULL,
    model      TEXT NOT NULL,
    weight     REAL DEFAULT 1,
    PRIMARY KEY (combo_name, model)
  );

  -- Users: already columnar, unchanged
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'admin',
    created_at    TEXT
  );

  -- Sessions: already columnar, unchanged
  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT
  );

  -- Combo latency: already columnar, unchanged
  CREATE TABLE IF NOT EXISTS combo_latency (
    combo_name TEXT NOT NULL,
    model      TEXT NOT NULL,
    ttft_ms    INTEGER NOT NULL,
    timestamp  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_cl ON combo_latency(combo_name, model, timestamp);

  -- Usage log: already columnar, unchanged
  CREATE TABLE IF NOT EXISTS usage_log (
    id                 TEXT PRIMARY KEY,
    timestamp          TEXT NOT NULL,
    endpoint           TEXT,
    provider           TEXT,
    model              TEXT,
    connection_id      TEXT,
    api_key_id         TEXT,
    status             TEXT DEFAULT 'ok',
    prompt_tokens      INTEGER DEFAULT 0,
    completion_tokens  INTEGER DEFAULT 0,
    reasoning_tokens   INTEGER DEFAULT 0,
    cached_tokens      INTEGER DEFAULT 0,
    cost               REAL DEFAULT 0,
    duration_ms        INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_usage_ts       ON usage_log(timestamp);
  CREATE INDEX IF NOT EXISTS idx_usage_provider ON usage_log(provider);
  CREATE INDEX IF NOT EXISTS idx_usage_api_key  ON usage_log(api_key_id);

  -- Schema version tracking
  CREATE TABLE IF NOT EXISTS schema_version (
    version    INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  );
`;

// ─── V1 Schema (for reference only, used by migration) ─────────────────────────────

export const CREATE_TABLES_V1 = `
  CREATE TABLE IF NOT EXISTS provider_connections (
    id       TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    data     TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pc_provider ON provider_connections(provider);

  CREATE TABLE IF NOT EXISTS provider_nodes (
    id         TEXT PRIMARY KEY,
    type       TEXT,
    name       TEXT,
    prefix     TEXT,
    api_type   TEXT,
    base_url   TEXT,
    created_at TEXT,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS proxy_pools (
    id   TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS combos (
    id         TEXT PRIMARY KEY,
    name       TEXT UNIQUE NOT NULL,
    models     TEXT NOT NULL,
    created_at TEXT,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    id         TEXT PRIMARY KEY,
    name       TEXT,
    key        TEXT UNIQUE,
    machine_id TEXT,
    is_active  INTEGER DEFAULT 1,
    created_at TEXT,
    user_id    TEXT
  );

  CREATE TABLE IF NOT EXISTS kv (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'admin',
    created_at    TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS combo_latency (
    combo_name TEXT NOT NULL,
    model      TEXT NOT NULL,
    ttft_ms    INTEGER NOT NULL,
    timestamp  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_cl ON combo_latency(combo_name, model, timestamp);

  CREATE TABLE IF NOT EXISTS usage_log (
    id                 TEXT PRIMARY KEY,
    timestamp          TEXT NOT NULL,
    endpoint           TEXT,
    provider           TEXT,
    model              TEXT,
    connection_id      TEXT,
    api_key_id         TEXT,
    status             TEXT DEFAULT 'ok',
    prompt_tokens      INTEGER DEFAULT 0,
    completion_tokens  INTEGER DEFAULT 0,
    reasoning_tokens   INTEGER DEFAULT 0,
    cached_tokens      INTEGER DEFAULT 0,
    cost               REAL DEFAULT 0,
    duration_ms        INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_usage_ts       ON usage_log(timestamp);
  CREATE INDEX IF NOT EXISTS idx_usage_provider ON usage_log(provider);
  CREATE INDEX IF NOT EXISTS idx_usage_api_key  ON usage_log(api_key_id);
`;

// ─── Default Settings ──────────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS = {
  cloudEnabled: false,
  tunnelEnabled: false,
  tunnelUrl: "",
  stickyRoundRobinLimit: 3,
  providerStrategies: {},
  comboStrategy: "fallback",
  comboStrategies: {},
  requireLogin: true,
  requireApiKey: false,
  observabilityEnabled: true,
  observabilityMaxRecords: 1000,
  observabilityBatchSize: 20,
  observabilityFlushIntervalMs: 5000,
  observabilityMaxJsonSize: 1024,
  outboundProxyEnabled: false,
  outboundProxyUrl: "",
  outboundNoProxy: "",
  mitmRouterBaseUrl: "http://localhost:20128",
  ccFilterNaming: false,
  fallbackStrategy: "fill-first",
} as const;

export type Settings = typeof DEFAULT_SETTINGS;

// ─── Type-safe setting keys ────────────────────────────────────────────────────────

export const SETTINGS_KEYS = {
  CLOUD_ENABLED: "cloudEnabled",
  TUNNEL_ENABLED: "tunnelEnabled",
  TUNNEL_URL: "tunnelUrl",
  STICKY_ROUND_ROBIN_LIMIT: "stickyRoundRobinLimit",
  PROVIDER_STRATEGIES: "providerStrategies",
  COMBO_STRATEGY: "comboStrategy",
  COMBO_STRATEGIES: "comboStrategies",
  REQUIRE_LOGIN: "requireLogin",
  REQUIRE_API_KEY: "requireApiKey",
  OBSERVABILITY_ENABLED: "observabilityEnabled",
  OBSERVABILITY_MAX_RECORDS: "observabilityMaxRecords",
  OBSERVABILITY_BATCH_SIZE: "observabilityBatchSize",
  OBSERVABILITY_FLUSH_INTERVAL_MS: "observabilityFlushIntervalMs",
  OBSERVABILITY_MAX_JSON_SIZE: "observabilityMaxJsonSize",
  OUTBOUND_PROXY_ENABLED: "outboundProxyEnabled",
  OUTBOUND_PROXY_URL: "outboundProxyUrl",
  OUTBOUND_NO_PROXY: "outboundNoProxy",
  MITM_ROUTER_BASE_URL: "mitmRouterBaseUrl",
  CC_FILTER_NAMING: "ccFilterNaming",
  FALLBACK_STRATEGY: "fallbackStrategy",
} as const;

// Use V2 schema as default
export const CREATE_TABLES = CREATE_TABLES_V2;
