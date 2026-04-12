import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { CREATE_TABLES, DEFAULT_SETTINGS } from "./schema.ts";
import { runMigrations, CURRENT_SCHEMA_VERSION } from "./migrations.ts";
import { getRawDb, setDb } from "./connection.ts";

// ─── DB singleton ──────────────────────────────────────────────────────────────

let _db: Database | null = null;

export function openDb(): Database {
  if (_db) return _db;

  // Get the raw database connection (creates it if needed)
  const db = getRawDb();

  // Check if we need to create tables (fresh install)
  const hasTables = db
    .query<
      { name: string },
      []
    >("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('provider_connections', 'users')")
    .all();

  if (hasTables.length === 0) {
    // Fresh install - create v2 schema directly
    db.run(CREATE_TABLES);
    // Record current version
    db.run("INSERT INTO schema_version (version, applied_at) VALUES (?, ?)", [
      CURRENT_SCHEMA_VERSION,
      new Date().toISOString(),
    ]);
    // Seed default settings
    seedDefaultSettings(db);
  } else {
    // Existing install - run migrations
    runMigrations(db);
  }

  // Clean up expired sessions on startup
  db.run("DELETE FROM sessions WHERE expires_at < ?", [new Date().toISOString()]);

  // Bootstrap admin user from env vars (only if username doesn't exist yet)
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminUsername && adminPassword) {
    const existing = db
      .query<{ id: string }, string>("SELECT id FROM users WHERE username = ?")
      .get(adminUsername);
    if (!existing) {
      // Hash synchronously at startup — Bun.password.hashSync uses argon2id
      const hash = Bun.password.hashSync(adminPassword);
      const id = randomUUID();
      db.run(
        "INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, 'admin', ?)",
        [id, adminUsername, hash, new Date().toISOString()]
      );
      console.log(`[AUTH] Created admin user: ${adminUsername}`);
    }
  }

  _db = db;
  setDb(db);
  return db;
}

function db(): Database {
  return _db ?? openDb();
}

function seedDefaultSettings(database: Database): void {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    database.run("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", [
      key,
      JSON.stringify(value),
    ]);
  }
}

// ─── Provider Connections ──────────────────────────────────────────────────────

export interface ProviderConnection {
  id: string;
  provider: string;
  name?: string;
  displayName?: string;
  email?: string;
  authType?: string;
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt?: string;
  projectId?: string;
  priority?: number;
  isActive?: boolean;
  testStatus?: string;
  lastError?: string;
  errorCode?: number;
  lastErrorAt?: string;
  backoffLevel?: number;
  lastUsedAt?: string;
  consecutiveUseCount?: number;
  providerSpecificData?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  // Dynamic properties (e.g., modelLock_*, stored in provider_specific_data but accessed via getter for backward compat)
  [key: string]: unknown;
}

export async function getProviderConnections(
  filter: { provider?: string; isActive?: boolean } = {}
): Promise<ProviderConnection[]> {
  let rows: Array<{
    id: string;
    provider: string;
    name: string;
    display_name: string;
    email: string;
    auth_type: string;
    api_key: string;
    access_token: string;
    refresh_token: string;
    id_token: string;
    expires_at: string;
    project_id: string;
    priority: number;
    is_active: number;
    test_status: string;
    last_error: string;
    error_code: number;
    last_error_at: string;
    backoff_level: number;
    last_used_at: string;
    consecutive_use_count: number;
    provider_specific_data: string;
    created_at: string;
    updated_at: string;
  }>;

  if (filter.provider && filter.isActive !== undefined) {
    rows = db()
      .query<
        {
          id: string;
          provider: string;
          name: string;
          display_name: string;
          email: string;
          auth_type: string;
          api_key: string;
          access_token: string;
          refresh_token: string;
          id_token: string;
          expires_at: string;
          project_id: string;
          priority: number;
          is_active: number;
          test_status: string;
          last_error: string;
          error_code: number;
          last_error_at: string;
          backoff_level: number;
          last_used_at: string;
          consecutive_use_count: number;
          provider_specific_data: string;
          created_at: string;
          updated_at: string;
        },
        [string, number]
      >(
        `SELECT id, provider, name, display_name, email, auth_type, api_key,
                access_token, refresh_token, id_token, expires_at, project_id,
                priority, is_active, test_status, last_error, error_code,
                last_error_at, backoff_level, last_used_at, consecutive_use_count,
                provider_specific_data, created_at, updated_at
         FROM provider_connections WHERE provider = ? AND is_active = ?`
      )
      .all(filter.provider, filter.isActive ? 1 : 0);
  } else if (filter.provider) {
    rows = db()
      .query<
        {
          id: string;
          provider: string;
          name: string;
          display_name: string;
          email: string;
          auth_type: string;
          api_key: string;
          access_token: string;
          refresh_token: string;
          id_token: string;
          expires_at: string;
          project_id: string;
          priority: number;
          is_active: number;
          test_status: string;
          last_error: string;
          error_code: number;
          last_error_at: string;
          backoff_level: number;
          last_used_at: string;
          consecutive_use_count: number;
          provider_specific_data: string;
          created_at: string;
          updated_at: string;
        },
        [string]
      >(
        `SELECT id, provider, name, display_name, email, auth_type, api_key,
                access_token, refresh_token, id_token, expires_at, project_id,
                priority, is_active, test_status, last_error, error_code,
                last_error_at, backoff_level, last_used_at, consecutive_use_count,
                provider_specific_data, created_at, updated_at
         FROM provider_connections WHERE provider = ?`
      )
      .all(filter.provider);
  } else if (filter.isActive !== undefined) {
    rows = db()
      .query<
        {
          id: string;
          provider: string;
          name: string;
          display_name: string;
          email: string;
          auth_type: string;
          api_key: string;
          access_token: string;
          refresh_token: string;
          id_token: string;
          expires_at: string;
          project_id: string;
          priority: number;
          is_active: number;
          test_status: string;
          last_error: string;
          error_code: number;
          last_error_at: string;
          backoff_level: number;
          last_used_at: string;
          consecutive_use_count: number;
          provider_specific_data: string;
          created_at: string;
          updated_at: string;
        },
        [number]
      >(
        `SELECT id, provider, name, display_name, email, auth_type, api_key,
                access_token, refresh_token, id_token, expires_at, project_id,
                priority, is_active, test_status, last_error, error_code,
                last_error_at, backoff_level, last_used_at, consecutive_use_count,
                provider_specific_data, created_at, updated_at
         FROM provider_connections WHERE is_active = ?`
      )
      .all(filter.isActive ? 1 : 0);
  } else {
    rows = db()
      .query<
        {
          id: string;
          provider: string;
          name: string;
          display_name: string;
          email: string;
          auth_type: string;
          api_key: string;
          access_token: string;
          refresh_token: string;
          id_token: string;
          expires_at: string;
          project_id: string;
          priority: number;
          is_active: number;
          test_status: string;
          last_error: string;
          error_code: number;
          last_error_at: string;
          backoff_level: number;
          last_used_at: string;
          consecutive_use_count: number;
          provider_specific_data: string;
          created_at: string;
          updated_at: string;
        },
        []
      >(
        `SELECT id, provider, name, display_name, email, auth_type, api_key,
                access_token, refresh_token, id_token, expires_at, project_id,
                priority, is_active, test_status, last_error, error_code,
                last_error_at, backoff_level, last_used_at, consecutive_use_count,
                provider_specific_data, created_at, updated_at
         FROM provider_connections`
      )
      .all();
  }

  const connections = rows.map((r): ProviderConnection => {
    const psd = r.provider_specific_data
      ? (JSON.parse(r.provider_specific_data) as Record<string, unknown>)
      : {};

    // Flatten model locks to top level for backward compatibility
    const result: ProviderConnection = {
      id: r.id,
      provider: r.provider,
      name: r.name ?? undefined,
      displayName: r.display_name ?? undefined,
      email: r.email ?? undefined,
      authType: r.auth_type ?? undefined,
      apiKey: r.api_key ?? undefined,
      accessToken: r.access_token ?? undefined,
      refreshToken: r.refresh_token ?? undefined,
      idToken: r.id_token ?? undefined,
      expiresAt: r.expires_at ?? undefined,
      projectId: r.project_id ?? undefined,
      priority: r.priority ?? 1,
      isActive: r.is_active === 1,
      testStatus: r.test_status ?? undefined,
      lastError: r.last_error ?? undefined,
      errorCode: r.error_code ?? undefined,
      lastErrorAt: r.last_error_at ?? undefined,
      backoffLevel: r.backoff_level ?? 0,
      lastUsedAt: r.last_used_at ?? undefined,
      consecutiveUseCount: r.consecutive_use_count ?? 0,
      providerSpecificData: psd,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };

    // Flatten modelLock_* keys to top level for backward compatibility
    for (const [key, value] of Object.entries(psd)) {
      if (key.startsWith("modelLock_")) {
        result[key] = value;
      }
    }

    return result;
  });

  // Sort by priority (lower = higher priority)
  connections.sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));
  return connections;
}

export async function getProviderConnectionById(id: string): Promise<ProviderConnection | null> {
  const row = db()
    .query<
      {
        id: string;
        provider: string;
        name: string;
        display_name: string;
        email: string;
        auth_type: string;
        api_key: string;
        access_token: string;
        refresh_token: string;
        id_token: string;
        expires_at: string;
        project_id: string;
        priority: number;
        is_active: number;
        test_status: string;
        last_error: string;
        error_code: number;
        last_error_at: string;
        backoff_level: number;
        last_used_at: string;
        consecutive_use_count: number;
        provider_specific_data: string;
        created_at: string;
        updated_at: string;
      },
      string
    >(
      `SELECT id, provider, name, display_name, email, auth_type, api_key,
              access_token, refresh_token, id_token, expires_at, project_id,
              priority, is_active, test_status, last_error, error_code,
              last_error_at, backoff_level, last_used_at, consecutive_use_count,
              provider_specific_data, created_at, updated_at
       FROM provider_connections WHERE id = ?`
    )
    .get(id);

  if (!row) return null;

  const psd = row.provider_specific_data
    ? (JSON.parse(row.provider_specific_data) as Record<string, unknown>)
    : {};

  const result: ProviderConnection = {
    id: row.id,
    provider: row.provider,
    name: row.name ?? undefined,
    displayName: row.display_name ?? undefined,
    email: row.email ?? undefined,
    authType: row.auth_type ?? undefined,
    apiKey: row.api_key ?? undefined,
    accessToken: row.access_token ?? undefined,
    refreshToken: row.refresh_token ?? undefined,
    idToken: row.id_token ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    projectId: row.project_id ?? undefined,
    priority: row.priority ?? 1,
    isActive: row.is_active === 1,
    testStatus: row.test_status ?? undefined,
    lastError: row.last_error ?? undefined,
    errorCode: row.error_code ?? undefined,
    lastErrorAt: row.last_error_at ?? undefined,
    backoffLevel: row.backoff_level ?? 0,
    lastUsedAt: row.last_used_at ?? undefined,
    consecutiveUseCount: row.consecutive_use_count ?? 0,
    providerSpecificData: psd,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  // Flatten modelLock_* keys to top level for backward compatibility
  for (const [key, value] of Object.entries(psd)) {
    if (key.startsWith("modelLock_")) {
      result[key] = value;
    }
  }

  return result;
}

export async function createProviderConnection(
  data: Record<string, unknown>
): Promise<ProviderConnection> {
  const id = (data.id as string) ?? randomUUID();
  const now = new Date().toISOString();

  // Extract provider-specific data (fields not in the columnar schema)
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
  ];

  const providerSpecificData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!specificFields.includes(key)) {
      providerSpecificData[key] = value;
    }
  }

  db().run(
    `INSERT INTO provider_connections (
      id, provider, name, display_name, email, auth_type, api_key,
      access_token, refresh_token, id_token, expires_at, project_id,
      priority, is_active, test_status, last_error, error_code,
      last_error_at, backoff_level, last_used_at, consecutive_use_count,
      provider_specific_data, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      display_name = excluded.display_name,
      email = excluded.email,
      auth_type = excluded.auth_type,
      api_key = excluded.api_key,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      id_token = excluded.id_token,
      expires_at = excluded.expires_at,
      project_id = excluded.project_id,
      priority = excluded.priority,
      is_active = excluded.is_active,
      test_status = excluded.test_status,
      last_error = excluded.last_error,
      error_code = excluded.error_code,
      last_error_at = excluded.last_error_at,
      backoff_level = excluded.backoff_level,
      last_used_at = excluded.last_used_at,
      consecutive_use_count = excluded.consecutive_use_count,
      provider_specific_data = excluded.provider_specific_data,
      updated_at = excluded.updated_at`,
    [
      id,
      data.provider as string,
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
      data.isActive === undefined ? 1 : toBool(data.isActive) ? 1 : 0,
      toStringOrNull(data.testStatus) ?? "unknown",
      toStringOrNull(data.lastError),
      toIntOrNull(data.errorCode),
      toStringOrNull(data.lastErrorAt),
      toInt(data.backoffLevel, 0),
      toStringOrNull(data.lastUsedAt),
      toInt(data.consecutiveUseCount, 0),
      Object.keys(providerSpecificData).length > 0 ? JSON.stringify(providerSpecificData) : null,
      data.createdAt ? toStringOrNull(data.createdAt) : now,
      now,
    ]
  );

  return (await getProviderConnectionById(id))!;
}

export async function updateProviderConnection(
  id: string,
  data: Record<string, unknown>
): Promise<ProviderConnection | null> {
  const existing = await getProviderConnectionById(id);
  if (!existing) return null;

  // Get current provider-specific data
  const currentPsd = { ...(existing.providerSpecificData ?? {}) };
  const newPsd = (data.providerSpecificData as Record<string, unknown>) ?? {};

  // Column fields that are stored in the main table
  const columnFields = [
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
    "providerSpecificData",
  ];

  // Merge provider-specific data (deep merge for nested objects)
  const mergedPsd = { ...currentPsd };
  for (const [key, value] of Object.entries(newPsd)) {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      mergedPsd[key] = { ...(mergedPsd[key] as Record<string, unknown>), ...value };
    } else {
      mergedPsd[key] = value;
    }
  }

  // Handle model lock keys and other non-column fields passed directly
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith("modelLock_") || !columnFields.includes(key)) {
      if (value === null) {
        delete mergedPsd[key];
      } else {
        mergedPsd[key] = value;
      }
    }
  }

  // Collect column updates
  const updates: string[] = [];
  const params: (string | number | null)[] = [];

  // Process column fields, excluding providerSpecificData (handled separately below)
  for (const field of columnFields) {
    if (field === "providerSpecificData") continue; // Skip - handled separately
    if (field in data) {
      updates.push(`${camelToSnake(field)} = ?`);
      params.push(
        field === "priority" ||
          field === "errorCode" ||
          field === "backoffLevel" ||
          field === "consecutiveUseCount"
          ? toInt(data[field], 0)
          : field === "isActive"
            ? toBool(data[field])
              ? 1
              : 0
            : toStringOrNull(data[field])
      );
    }
  }

  // Always update provider_specific_data (merged with model locks and other dynamic fields)
  updates.push("provider_specific_data = ?");
  params.push(Object.keys(mergedPsd).length > 0 ? JSON.stringify(mergedPsd) : null);

  updates.push("updated_at = ?");
  params.push(new Date().toISOString());

  params.push(id);

  db().run(`UPDATE provider_connections SET ${updates.join(", ")} WHERE id = ?`, params);

  return getProviderConnectionById(id);
}

export async function deleteProviderConnection(id: string): Promise<boolean> {
  const result = db().run("DELETE FROM provider_connections WHERE id = ?", [id]);
  return (result.changes ?? 0) > 0;
}

export async function deleteProviderConnectionsByProvider(providerId: string): Promise<number> {
  const result = db().run("DELETE FROM provider_connections WHERE provider = ?", [providerId]);
  return result.changes ?? 0;
}

export async function reorderProviderConnections(_providerId: string): Promise<void> {
  // SQLite handles concurrent access; no reordering needed for bun runtime
}

// ─── Provider Nodes ────────────────────────────────────────────────────────────

export interface ProviderNode {
  id: string;
  type?: string;
  name?: string;
  prefix?: string;
  apiType?: string;
  baseUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export async function getProviderNodes(filter: { type?: string } = {}): Promise<ProviderNode[]> {
  let rows: ProviderNode[];
  if (filter.type) {
    rows = db()
      .query<
        ProviderNode,
        string
      >("SELECT id, type, name, prefix, api_type as apiType, base_url as baseUrl, created_at as createdAt, updated_at as updatedAt FROM provider_nodes WHERE type = ?")
      .all(filter.type);
  } else {
    rows = db()
      .query<
        ProviderNode,
        []
      >("SELECT id, type, name, prefix, api_type as apiType, base_url as baseUrl, created_at as createdAt, updated_at as updatedAt FROM provider_nodes")
      .all();
  }
  return rows;
}

export async function getProviderNodeById(id: string): Promise<ProviderNode | null> {
  return (
    db()
      .query<
        ProviderNode,
        string
      >("SELECT id, type, name, prefix, api_type as apiType, base_url as baseUrl, created_at as createdAt, updated_at as updatedAt FROM provider_nodes WHERE id = ?")
      .get(id) ?? null
  );
}

export async function createProviderNode(data: Record<string, unknown>): Promise<ProviderNode> {
  const id = (data.id as string) ?? randomUUID();
  const now = new Date().toISOString();
  db().run(
    "INSERT INTO provider_nodes (id, type, name, prefix, api_type, base_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      id,
      data.type ? toStringOrNull(data.type) : null,
      data.name ? toStringOrNull(data.name) : null,
      data.prefix ? toStringOrNull(data.prefix) : null,
      data.apiType ? toStringOrNull(data.apiType) : null,
      data.baseUrl ? toStringOrNull(data.baseUrl) : null,
      now,
      now,
    ]
  );
  return {
    id,
    ...(data as Record<string, unknown>),
    createdAt: now,
    updatedAt: now,
  } as ProviderNode;
}

export async function updateProviderNode(
  id: string,
  data: Record<string, unknown>
): Promise<ProviderNode | null> {
  const now = new Date().toISOString();
  db().run(
    "UPDATE provider_nodes SET type = COALESCE(?, type), name = COALESCE(?, name), prefix = COALESCE(?, prefix), api_type = COALESCE(?, api_type), base_url = COALESCE(?, base_url), updated_at = ? WHERE id = ?",
    [
      data.type ? toStringOrNull(data.type) : null,
      data.name ? toStringOrNull(data.name) : null,
      data.prefix ? toStringOrNull(data.prefix) : null,
      data.apiType ? toStringOrNull(data.apiType) : null,
      data.baseUrl ? toStringOrNull(data.baseUrl) : null,
      now,
      id,
    ]
  );
  return getProviderNodeById(id);
}

export async function deleteProviderNode(id: string): Promise<boolean> {
  const result = db().run("DELETE FROM provider_nodes WHERE id = ?", [id]);
  return (result.changes ?? 0) > 0;
}

// ─── Proxy Pools ───────────────────────────────────────────────────────────────

export interface ProxyPool {
  id: string;
  name?: string;
  proxyUrl?: string;
  noProxy?: string;
  isActive?: boolean;
  strictProxy?: boolean;
  testStatus?: string;
  lastTestedAt?: string;
  lastError?: string;
  createdAt?: string;
  updatedAt?: string;
}

export async function getProxyPools(
  filter: { isActive?: boolean; testStatus?: string } = {}
): Promise<ProxyPool[]> {
  let rows: Array<{
    id: string;
    name: string;
    proxy_url: string;
    no_proxy: string;
    is_active: number;
    strict_proxy: number;
    test_status: string;
    last_tested_at: string;
    last_error: string;
    created_at: string;
    updated_at: string;
  }>;

  if (filter.isActive !== undefined && filter.testStatus) {
    rows = db()
      .query<
        {
          id: string;
          name: string;
          proxy_url: string;
          no_proxy: string;
          is_active: number;
          strict_proxy: number;
          test_status: string;
          last_tested_at: string;
          last_error: string;
          created_at: string;
          updated_at: string;
        },
        [number, string]
      >(
        `SELECT id, name, proxy_url, no_proxy, is_active, strict_proxy,
                test_status, last_tested_at, last_error, created_at, updated_at
         FROM proxy_pools WHERE is_active = ? AND test_status = ?
         ORDER BY updated_at DESC`
      )
      .all(filter.isActive ? 1 : 0, filter.testStatus);
  } else if (filter.isActive !== undefined) {
    rows = db()
      .query<
        {
          id: string;
          name: string;
          proxy_url: string;
          no_proxy: string;
          is_active: number;
          strict_proxy: number;
          test_status: string;
          last_tested_at: string;
          last_error: string;
          created_at: string;
          updated_at: string;
        },
        [number]
      >(
        `SELECT id, name, proxy_url, no_proxy, is_active, strict_proxy,
                test_status, last_tested_at, last_error, created_at, updated_at
         FROM proxy_pools WHERE is_active = ?
         ORDER BY updated_at DESC`
      )
      .all(filter.isActive ? 1 : 0);
  } else if (filter.testStatus) {
    rows = db()
      .query<
        {
          id: string;
          name: string;
          proxy_url: string;
          no_proxy: string;
          is_active: number;
          strict_proxy: number;
          test_status: string;
          last_tested_at: string;
          last_error: string;
          created_at: string;
          updated_at: string;
        },
        [string]
      >(
        `SELECT id, name, proxy_url, no_proxy, is_active, strict_proxy,
                test_status, last_tested_at, last_error, created_at, updated_at
         FROM proxy_pools WHERE test_status = ?
         ORDER BY updated_at DESC`
      )
      .all(filter.testStatus);
  } else {
    rows = db()
      .query<
        {
          id: string;
          name: string;
          proxy_url: string;
          no_proxy: string;
          is_active: number;
          strict_proxy: number;
          test_status: string;
          last_tested_at: string;
          last_error: string;
          created_at: string;
          updated_at: string;
        },
        []
      >(
        `SELECT id, name, proxy_url, no_proxy, is_active, strict_proxy,
                test_status, last_tested_at, last_error, created_at, updated_at
         FROM proxy_pools ORDER BY updated_at DESC`
      )
      .all();
  }

  return rows.map(
    (r): ProxyPool => ({
      id: r.id,
      name: r.name ?? undefined,
      proxyUrl: r.proxy_url ?? undefined,
      noProxy: r.no_proxy ?? undefined,
      isActive: r.is_active === 1,
      strictProxy: r.strict_proxy === 1,
      testStatus: r.test_status ?? undefined,
      lastTestedAt: r.last_tested_at ?? undefined,
      lastError: r.last_error ?? undefined,
      createdAt: r.created_at ?? undefined,
      updatedAt: r.updated_at ?? undefined,
    })
  );
}

export async function getProxyPoolById(id: string): Promise<ProxyPool | null> {
  const row = db()
    .query<
      {
        id: string;
        name: string;
        proxy_url: string;
        no_proxy: string;
        is_active: number;
        strict_proxy: number;
        test_status: string;
        last_tested_at: string;
        last_error: string;
        created_at: string;
        updated_at: string;
      },
      string
    >(
      `SELECT id, name, proxy_url, no_proxy, is_active, strict_proxy,
              test_status, last_tested_at, last_error, created_at, updated_at
       FROM proxy_pools WHERE id = ?`
    )
    .get(id);

  if (!row) return null;

  return {
    id: row.id,
    name: row.name ?? undefined,
    proxyUrl: row.proxy_url ?? undefined,
    noProxy: row.no_proxy ?? undefined,
    isActive: row.is_active === 1,
    strictProxy: row.strict_proxy === 1,
    testStatus: row.test_status ?? undefined,
    lastTestedAt: row.last_tested_at ?? undefined,
    lastError: row.last_error ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  };
}

export async function createProxyPool(data: Record<string, unknown>): Promise<ProxyPool> {
  const id = (data.id as string) ?? randomUUID();
  const now = new Date().toISOString();

  db().run(
    `INSERT INTO proxy_pools (
      id, name, proxy_url, no_proxy, is_active, strict_proxy,
      test_status, last_tested_at, last_error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      proxy_url = excluded.proxy_url,
      no_proxy = excluded.no_proxy,
      is_active = excluded.is_active,
      strict_proxy = excluded.strict_proxy,
      test_status = excluded.test_status,
      last_tested_at = excluded.last_tested_at,
      last_error = excluded.last_error,
      updated_at = excluded.updated_at`,
    [
      id,
      toStringOrNull(data.name),
      toStringOrNull(data.proxyUrl),
      toStringOrNull(data.noProxy),
      toBool(data.isActive) ? 1 : 0,
      toBool(data.strictProxy) ? 1 : 0,
      toStringOrNull(data.testStatus),
      toStringOrNull(data.lastTestedAt),
      toStringOrNull(data.lastError),
      data.createdAt ? toStringOrNull(data.createdAt) : now,
      now,
    ]
  );

  return (await getProxyPoolById(id))!;
}

export async function updateProxyPool(
  id: string,
  data: Record<string, unknown>
): Promise<ProxyPool | null> {
  const existing = await getProxyPoolById(id);
  if (!existing) return null;

  const updates: string[] = [];
  const params: (string | number | null)[] = [];

  const fields = [
    "name",
    "proxyUrl",
    "noProxy",
    "isActive",
    "strictProxy",
    "testStatus",
    "lastTestedAt",
    "lastError",
  ];

  for (const field of fields) {
    if (field in data) {
      updates.push(`${camelToSnake(field)} = ?`);
      params.push(
        field === "isActive" || field === "strictProxy"
          ? toBool(data[field])
            ? 1
            : 0
          : toStringOrNull(data[field])
      );
    }
  }

  updates.push("updated_at = ?");
  params.push(new Date().toISOString());
  params.push(id);

  db().run(`UPDATE proxy_pools SET ${updates.join(", ")} WHERE id = ?`, params);

  return getProxyPoolById(id);
}

export async function deleteProxyPool(id: string): Promise<boolean> {
  const result = db().run("DELETE FROM proxy_pools WHERE id = ?", [id]);
  return (result.changes ?? 0) > 0;
}

// ─── Combos ────────────────────────────────────────────────────────────────────

export interface Combo {
  id: string;
  name: string;
  models: string[];
  createdAt?: string;
  updatedAt?: string;
}

export async function getCombos(): Promise<Combo[]> {
  return db()
    .query<
      { id: string; name: string; models: string; created_at: string; updated_at: string },
      []
    >("SELECT id, name, models, created_at, updated_at FROM combos")
    .all()
    .map((r) => ({
      id: r.id,
      name: r.name,
      models: JSON.parse(r.models) as string[],
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
}

export async function getComboById(id: string): Promise<Combo | null> {
  const row = db()
    .query<
      { id: string; name: string; models: string; created_at: string; updated_at: string },
      string
    >("SELECT id, name, models, created_at, updated_at FROM combos WHERE id = ?")
    .get(id);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    models: JSON.parse(row.models) as string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getComboByName(name: string): Promise<Combo | null> {
  const row = db()
    .query<
      { id: string; name: string; models: string; created_at: string; updated_at: string },
      string
    >("SELECT id, name, models, created_at, updated_at FROM combos WHERE name = ?")
    .get(name);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    models: JSON.parse(row.models) as string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createCombo(data: { name: string; models?: string[] }): Promise<Combo> {
  const id = randomUUID();
  const now = new Date().toISOString();
  db().run("INSERT INTO combos (id, name, models, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", [
    id,
    data.name,
    JSON.stringify(data.models ?? []),
    now,
    now,
  ]);
  return { id, name: data.name, models: data.models ?? [], createdAt: now, updatedAt: now };
}

export async function updateCombo(id: string, data: Partial<Combo>): Promise<Combo | null> {
  const now = new Date().toISOString();
  if (data.models !== undefined) {
    if (data.name !== undefined) {
      db().run("UPDATE combos SET name = ?, models = ?, updated_at = ? WHERE id = ?", [
        data.name,
        JSON.stringify(data.models),
        now,
        id,
      ]);
    } else {
      db().run("UPDATE combos SET models = ?, updated_at = ? WHERE id = ?", [
        JSON.stringify(data.models),
        now,
        id,
      ]);
    }
  } else if (data.name) {
    db().run("UPDATE combos SET name = ?, updated_at = ? WHERE id = ?", [data.name, now, id]);
  }
  return getComboById(id);
}

export async function deleteCombo(id: string): Promise<boolean> {
  const combo = await getComboById(id);
  const result = db().run("DELETE FROM combos WHERE id = ?", [id]);
  if ((result.changes ?? 0) > 0 && combo) {
    await deleteComboConfig(combo.name);
  }
  return (result.changes ?? 0) > 0;
}

// ─── Combo Model Configs (dedicated table) ────────────────────────────────────────

export interface ComboModelConfig {
  model: string;
  weight: number;
}

export interface ComboConfig {
  name: string;
  models: ComboModelConfig[];
}

export async function getComboConfig(name: string): Promise<ComboConfig | null> {
  const rows = db()
    .query<
      { model: string; weight: number },
      string
    >("SELECT model, weight FROM combo_configs WHERE combo_name = ?")
    .all(name);

  if (rows.length === 0) return null;

  return {
    name,
    models: rows.map((r) => ({ model: r.model, weight: r.weight })),
  };
}

export async function setComboConfig(name: string, config: ComboConfig): Promise<void> {
  // Delete existing configs for this combo
  db().run("DELETE FROM combo_configs WHERE combo_name = ?", [name]);

  // Insert new configs
  for (const item of config.models) {
    db().run("INSERT INTO combo_configs (combo_name, model, weight) VALUES (?, ?, ?)", [
      name,
      item.model,
      item.weight ?? 1,
    ]);
  }
}

export async function deleteComboConfig(name: string): Promise<void> {
  db().run("DELETE FROM combo_configs WHERE combo_name = ?", [name]);
}

// ─── Combo TTFT Tracking ───────────────────────────────────────────────────────

const MAX_TTFT_SAMPLES = 50;

export async function recordComboTTFT(
  comboName: string,
  model: string,
  ttftMs: number
): Promise<void> {
  const timestamp = new Date().toISOString();
  db().run(
    "INSERT INTO combo_latency (combo_name, model, ttft_ms, timestamp) VALUES (?, ?, ?, ?)",
    [comboName, model, ttftMs, timestamp]
  );
  // Prune: keep only last MAX_TTFT_SAMPLES per (combo, model) by id
  db().run(
    `DELETE FROM combo_latency WHERE rowid NOT IN (
       SELECT rowid FROM combo_latency
       WHERE combo_name = ? AND model = ?
       ORDER BY timestamp DESC LIMIT ?
     ) AND combo_name = ? AND model = ?`,
    [comboName, model, MAX_TTFT_SAMPLES, comboName, model]
  );
}

export async function getAverageTTFT(
  comboName: string,
  model: string,
  sampleCount = 10
): Promise<number | null> {
  const rows = db()
    .query<{ avg_ms: number }, [string, string, number]>(
      `SELECT AVG(ttft_ms) as avg_ms FROM (
         SELECT ttft_ms FROM combo_latency
         WHERE combo_name = ? AND model = ?
         ORDER BY timestamp DESC LIMIT ?
       )`
    )
    .get(comboName, model, sampleCount);
  return rows?.avg_ms ?? null;
}

// ─── API Keys ──────────────────────────────────────────────────────────────────

export interface ApiKey {
  id: string;
  name?: string;
  key?: string;
  machineId?: string;
  isActive?: boolean;
  createdAt?: string;
  userId?: string | null;
}

export async function getApiKeys(filter: { userId?: string } = {}): Promise<ApiKey[]> {
  const rows = filter.userId
    ? db()
        .query<
          {
            id: string;
            name: string;
            key: string;
            machine_id: string;
            is_active: number;
            created_at: string;
            user_id: string | null;
          },
          string
        >(
          "SELECT id, name, key, machine_id, is_active, created_at, user_id FROM api_keys WHERE user_id = ?"
        )
        .all(filter.userId)
    : db()
        .query<
          {
            id: string;
            name: string;
            key: string;
            machine_id: string;
            is_active: number;
            created_at: string;
            user_id: string | null;
          },
          []
        >("SELECT id, name, key, machine_id, is_active, created_at, user_id FROM api_keys")
        .all();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    key: r.key,
    machineId: r.machine_id,
    isActive: r.is_active === 1,
    createdAt: r.created_at,
    userId: r.user_id ?? null,
  }));
}

export async function validateApiKey(key: string): Promise<boolean> {
  const row = db()
    .query<{ is_active: number }, string>("SELECT is_active FROM api_keys WHERE key = ?")
    .get(key);
  return row !== null && row.is_active === 1;
}

export async function getApiKeyByKey(key: string): Promise<ApiKey | null> {
  const row = db()
    .query<
      {
        id: string;
        name: string;
        key: string;
        machine_id: string;
        is_active: number;
        created_at: string;
        user_id: string | null;
      },
      string
    >(
      "SELECT id, name, key, machine_id, is_active, created_at, user_id FROM api_keys WHERE key = ?"
    )
    .get(key);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    key: row.key,
    machineId: row.machine_id,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    userId: row.user_id ?? null,
  };
}

export async function getApiKeyById(id: string): Promise<ApiKey | null> {
  const row = db()
    .query<
      {
        id: string;
        name: string;
        key: string;
        machine_id: string;
        is_active: number;
        created_at: string;
        user_id: string | null;
      },
      string
    >("SELECT id, name, key, machine_id, is_active, created_at, user_id FROM api_keys WHERE id = ?")
    .get(id);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    key: row.key,
    machineId: row.machine_id,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    userId: row.user_id ?? null,
  };
}

export async function createApiKey(
  name: string,
  _machineId?: string,
  userId?: string | null
): Promise<ApiKey> {
  const id = randomUUID();
  const key = `sk-${randomUUID().replace(/-/g, "")}`;
  const now = new Date().toISOString();
  db().run(
    "INSERT INTO api_keys (id, name, key, machine_id, is_active, created_at, user_id) VALUES (?, ?, ?, ?, 1, ?, ?)",
    [id, name, key, _machineId ?? null, now, userId ?? null]
  );
  return {
    id,
    name,
    key,
    machineId: _machineId,
    isActive: true,
    createdAt: now,
    userId: userId ?? null,
  };
}

export async function updateApiKey(id: string, data: Partial<ApiKey>): Promise<ApiKey | null> {
  const updates: string[] = [];
  const params: (string | number | null)[] = [];
  if (data.name !== undefined) {
    updates.push("name = ?");
    params.push(data.name);
  }
  if (data.isActive !== undefined) {
    updates.push("is_active = ?");
    params.push(data.isActive ? 1 : 0);
  }
  if (updates.length === 0) return getApiKeyById(id);
  params.push(id);
  db().run(`UPDATE api_keys SET ${updates.join(", ")} WHERE id = ?`, params);
  return getApiKeyById(id);
}

export async function deleteApiKey(id: string): Promise<boolean> {
  const result = db().run("DELETE FROM api_keys WHERE id = ?", [id]);
  return (result.changes ?? 0) > 0;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export type UserRole = "admin" | "user";

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  createdAt?: string;
}

export async function getUsers(): Promise<Omit<User, "passwordHash">[]> {
  return db()
    .query<{ id: string; username: string; role: string; created_at: string }, []>(
      "SELECT id, username, role, created_at FROM users"
    )
    .all()
    .map((r) => ({
      id: r.id,
      username: r.username,
      role: (r.role ?? "admin") as UserRole,
      createdAt: r.created_at,
    }));
}

export async function createUser(
  username: string,
  passwordHash: string,
  role: UserRole = "admin"
): Promise<User> {
  const normalizedUsername = username.toLowerCase();
  const id = randomUUID();
  const now = new Date().toISOString();
  db().run(
    "INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
    [id, normalizedUsername, passwordHash, role, now]
  );
  return {
    id,
    username: normalizedUsername,
    passwordHash,
    role,
    createdAt: now,
  };
}

export async function updateUserPassword(id: string, newHash: string): Promise<boolean> {
  const result = db().run("UPDATE users SET password_hash = ? WHERE id = ?", [newHash, id]);
  return (result.changes ?? 0) > 0;
}

export async function getUserByUsername(username: string): Promise<User | null> {
  const normalizedUsername = username.toLowerCase();
  const row = db()
    .query<
      { id: string; username: string; password_hash: string; role: string; created_at: string },
      string
    >("SELECT id, username, password_hash, role, created_at FROM users WHERE username = ?")
    .get(normalizedUsername);
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    role: (row.role ?? "admin") as UserRole,
    createdAt: row.created_at,
  };
}

export async function getUserById(id: string): Promise<User | null> {
  const row = db()
    .query<
      { id: string; username: string; password_hash: string; role: string; created_at: string },
      string
    >("SELECT id, username, password_hash, role, created_at FROM users WHERE id = ?")
    .get(id);
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    role: (row.role ?? "admin") as UserRole,
    createdAt: row.created_at,
  };
}

export async function deleteUser(id: string): Promise<boolean> {
  const db_ = db();
  // Delete associated sessions and API keys first
  db_.run("DELETE FROM sessions WHERE user_id = ?", [id]);
  db_.run("DELETE FROM api_keys WHERE user_id = ?", [id]);
  const result = db_.run("DELETE FROM users WHERE id = ?", [id]);
  return (result.changes ?? 0) > 0;
}

// ─── Sessions ──────────────────────────────────────────────────────────────────

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function createSession(userId: string): Promise<{ token: string; expiresAt: string }> {
  const token = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  db().run("INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)", [
    token,
    userId,
    expiresAt,
    now.toISOString(),
  ]);
  return { token, expiresAt };
}

export async function getSessionByToken(
  token: string
): Promise<{ userId: string; expiresAt: string } | null> {
  const row = db()
    .query<
      { user_id: string; expires_at: string },
      string
    >("SELECT user_id, expires_at FROM sessions WHERE token = ?")
    .get(token);
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    db().run("DELETE FROM sessions WHERE token = ?", [token]);
    return null;
  }
  return { userId: row.user_id, expiresAt: row.expires_at };
}

export async function deleteSession(token: string): Promise<void> {
  db().run("DELETE FROM sessions WHERE token = ?", [token]);
}

export async function deleteExpiredSessions(): Promise<void> {
  db().run("DELETE FROM sessions WHERE expires_at < ?", [new Date().toISOString()]);
}

// ─── Model Aliases (dedicated table) ─────────────────────────────────────────────

export async function getModelAliases(): Promise<Record<string, string>> {
  const rows = db()
    .query<{ alias: string; model: string }, []>("SELECT alias, model FROM model_aliases")
    .all();

  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.alias] = row.model;
  }
  return result;
}

export async function setModelAlias(alias: string, model: string): Promise<void> {
  db().run(
    "INSERT INTO model_aliases (alias, model) VALUES (?, ?) ON CONFLICT(alias) DO UPDATE SET model = excluded.model",
    [alias, model]
  );
}

export async function deleteModelAlias(alias: string): Promise<void> {
  db().run("DELETE FROM model_aliases WHERE alias = ?", [alias]);
}

// ─── MITM Alias (dedicated table) ────────────────────────────────────────────────

export async function getMitmAlias(toolName?: string): Promise<Record<string, unknown>> {
  if (toolName) {
    const rows = db()
      .query<
        { alias: string; model: string },
        string
      >("SELECT alias, model FROM mitm_aliases WHERE tool_name = ?")
      .all(toolName);

    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.alias] = row.model;
    }
    return result;
  }

  // Get all mitm aliases grouped by tool_name
  const rows = db()
    .query<
      { tool_name: string; alias: string; model: string },
      []
    >("SELECT tool_name, alias, model FROM mitm_aliases")
    .all();

  const result: Record<string, Record<string, string>> = {};
  for (const row of rows) {
    if (!result[row.tool_name]) {
      result[row.tool_name] = {};
    }
    result[row.tool_name]![row.alias] = row.model;
  }
  return result;
}

export async function setMitmAliasAll(
  toolName: string,
  mappings: Record<string, unknown>
): Promise<void> {
  // Delete existing aliases for this tool
  db().run("DELETE FROM mitm_aliases WHERE tool_name = ?", [toolName]);

  // Insert new mappings
  for (const [alias, model] of Object.entries(mappings)) {
    db().run("INSERT INTO mitm_aliases (tool_name, alias, model) VALUES (?, ?, ?)", [
      toolName,
      alias,
      toStringOrNull(model) ?? "",
    ]);
  }
}

// ─── Settings (dedicated table) ───────────────────────────────────────────────────

export async function getSettings(): Promise<typeof DEFAULT_SETTINGS & Record<string, unknown>> {
  const rows = db()
    .query<{ key: string; value: string }, []>("SELECT key, value FROM settings")
    .all();

  const stored: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      stored[row.key] = JSON.parse(row.value);
    } catch {
      stored[row.key] = row.value;
    }
  }

  return { ...DEFAULT_SETTINGS, ...stored } as typeof DEFAULT_SETTINGS & Record<string, unknown>;
}

export async function getSettingValue<T>(key: string, fallback: T): Promise<T> {
  const row = db()
    .query<{ value: string }, string>("SELECT value FROM settings WHERE key = ?")
    .get(key);

  if (!row) return fallback;

  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export async function updateSettings(
  updates: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const current = await getSettings();
  const next = { ...current, ...updates };

  for (const [key, value] of Object.entries(updates)) {
    db().run(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [key, JSON.stringify(value)]
    );
  }

  return next;
}

export async function updateSetting(key: string, value: unknown): Promise<void> {
  db().run(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, JSON.stringify(value)]
  );
}

function getProviderEnabledModelsSettingKey(providerId: string): string {
  return `providerEnabledModels:${providerId}`;
}

export async function getProviderEnabledModels(providerId: string): Promise<string[]> {
  const value = await getSettingValue<unknown>(getProviderEnabledModelsSettingKey(providerId), []);

  if (!Array.isArray(value)) return [];

  return value.filter(
    (modelId): modelId is string => typeof modelId === "string" && modelId.trim() !== ""
  );
}

export async function updateProviderEnabledModels(
  providerId: string,
  modelIds: unknown
): Promise<string[]> {
  const next = Array.isArray(modelIds)
    ? modelIds.filter(
        (modelId): modelId is string => typeof modelId === "string" && modelId.trim() !== ""
      )
    : [];

  await updateSetting(getProviderEnabledModelsSettingKey(providerId), next);
  return next;
}

export async function getAllProviderEnabledModels(): Promise<Record<string, string[]>> {
  const settings = await getSettings();
  const result: Record<string, string[]> = {};

  for (const [key, value] of Object.entries(settings)) {
    if (!key.startsWith("providerEnabledModels:")) continue;
    const providerId = key.slice("providerEnabledModels:".length);
    if (!providerId) continue;
    result[providerId] = Array.isArray(value)
      ? value.filter(
          (modelId): modelId is string => typeof modelId === "string" && modelId.trim() !== ""
        )
      : [];
  }

  return result;
}

// ─── Pricing (dedicated table) ───────────────────────────────────────────────────

export interface PricingEntry {
  input: number;
  output: number;
}

export async function getPricingForModel(
  provider: string,
  model: string
): Promise<PricingEntry | null> {
  const row = db()
    .query<
      { input: number; output: number },
      [string, string]
    >("SELECT input, output FROM pricing WHERE provider = ? AND model = ?")
    .get(provider, model);

  if (!row) return null;
  return { input: row.input, output: row.output };
}

export async function getPricing(): Promise<Record<string, Record<string, PricingEntry>>> {
  const rows = db()
    .query<
      { provider: string; model: string; input: number; output: number },
      []
    >("SELECT provider, model, input, output FROM pricing")
    .all();

  const result: Record<string, Record<string, PricingEntry>> = {};
  for (const row of rows) {
    if (!result[row.provider]) {
      result[row.provider] = {};
    }
    result[row.provider]![row.model] = { input: row.input, output: row.output };
  }
  return result;
}

export async function updatePricing(
  pricingData: Record<string, Record<string, PricingEntry>>
): Promise<void> {
  for (const [provider, models] of Object.entries(pricingData)) {
    for (const [model, pricing] of Object.entries(models)) {
      db().run(
        "INSERT INTO pricing (provider, model, input, output) VALUES (?, ?, ?, ?) ON CONFLICT(provider, model) DO UPDATE SET input = excluded.input, output = excluded.output",
        [provider, model, pricing.input ?? 0, pricing.output ?? 0]
      );
    }
  }
}

export async function updatePricingForModel(
  provider: string,
  model: string,
  pricing: PricingEntry
): Promise<void> {
  db().run(
    "INSERT INTO pricing (provider, model, input, output) VALUES (?, ?, ?, ?) ON CONFLICT(provider, model) DO UPDATE SET input = excluded.input, output = excluded.output",
    [provider, model, pricing.input ?? 0, pricing.output ?? 0]
  );
}

// ─── Export / Import ───────────────────────────────────────────────────────────

export async function exportDb(): Promise<Record<string, unknown>> {
  const [connections, nodes, pools, combos, keys, settings, aliases, pricing] = await Promise.all([
    getProviderConnections(),
    getProviderNodes(),
    getProxyPools(),
    getCombos(),
    getApiKeys(),
    getSettings(),
    getModelAliases(),
    getPricing(),
  ]);
  return {
    providerConnections: connections,
    providerNodes: nodes,
    proxyPools: pools,
    combos,
    apiKeys: keys,
    settings,
    modelAliases: aliases,
    pricing,
  };
}

export async function isCloudEnabled(): Promise<boolean> {
  return (await getSettingValue("cloudEnabled", false)) === true;
}

export async function getCloudUrl(): Promise<string> {
  const value = await getSettingValue<string | null>("cloudUrl", null);
  return value ?? process.env.CLOUD_URL ?? "";
}

export async function cleanupProviderConnections(): Promise<number> {
  // Not needed with columnar schema - no null accumulation
  return 0;
}

// ─── Helper functions ───────────────────────────────────────────────────────────

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

function toIntOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    return value.toLowerCase() === "true" || value === "1";
  }
  return false;
}

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
