// Determine API base URL:
// - Dev: Use Vite proxy (relative URL)
// - Prod build with VITE_API_URL set: Use that URL
// - Prod build without VITE_API_URL: Use same origin (assumes reverse proxy)
function getApiBaseUrl(): string {
  if (import.meta.env.DEV) {
    // Development: use Vite proxy (empty string = relative URL)
    return import.meta.env.VITE_API_URL ?? "";
  }

  // Production: check if VITE_API_URL was set during build
  const buildTimeUrl = import.meta.env.VITE_API_URL;
  if (buildTimeUrl) return buildTimeUrl;

  // Production: use same origin (empty string = relative URL)
  // This works when both dashboard and API are behind the same domain/reverse proxy
  return "";
}

const BASE_URL = getApiBaseUrl();

// ─── Shared types ────────────────────────────────────────────────────────────────

export interface ModelWithWeight {
  model: string;
  weight: number;
}

export interface TestResult {
  valid: boolean;
  error: string | null;
  latencyMs: number;
  testedAt: string;
}

export interface ProviderCatalog {
  color: string;
  textIcon: string;
  name: string;
  website?: string;
  notice?: { text: string; apiKeyUrl?: string };
  deprecated?: boolean;
  deprecationNotice?: string;
}

export interface CatalogResponse {
  free: Record<string, ProviderCatalog>;
  freeTier: Record<string, ProviderCatalog>;
  apiKey: Record<string, ProviderCatalog>;
}

export interface ProviderNode {
  id: string;
  type?: string;
  name?: string;
  prefix?: string;
  apiType?: string;
  baseUrl?: string;
}

export interface ProviderConnection {
  id: string;
  provider: string;
  name?: string;
  displayName?: string;
  email?: string;
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  projectId?: string;
  baseUrl?: string;  // From providerSpecificData
  priority?: number;
  isActive?: boolean;
  authType?: string;
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
  // Dynamic properties (e.g., modelLock_*)
  [key: string]: unknown;
}

// ─── Request helper ─────────────────────────────────────────────────────────────

function getToken(): string | null {
  return localStorage.getItem("auth_token");
}

async function request<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });

  if (res.status === 401) {
    localStorage.removeItem("auth_token");
    // Only redirect if not already on login page (prevents reload loops)
    if (!window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface LoginResponse { token: string; username: string; userId: string; role: 'admin' | 'user' }

export const api = {
  auth: {
    login: (username: string, password: string) =>
      request<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      }),
    logout: () => request("/api/auth/logout", { method: "POST" }),
    me: () => request<{ id: string; username: string; role: 'admin' | 'user' }>("/api/auth/me"),
  },

  // ─── Providers ─────────────────────────────────────────────────────────────
  providers: {
    list:    () => request<{ connections: ProviderConnection[] }>("/api/providers"),
    catalog: () => request<CatalogResponse>("/api/providers/catalog"),
    nodes:   () => request<{ nodes: ProviderNode[] }>("/api/provider-nodes"),
    create:  (data: unknown) => request("/api/providers", { method: "POST", body: JSON.stringify(data) }),
    update:  (id: string, data: unknown) => request(`/api/providers/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove:  (id: string) => request(`/api/providers/${id}`, { method: "DELETE" }),
    test:    (id: string) => request<TestResult>(`/api/providers/${id}`, { method: "POST" }),
    testBatch: (mode: string) => request<{
      mode: string;
      providerId: string | null;
      results: Array<{
        provider: string;
        connectionId: string;
        connectionName: string;
        authType: string;
        valid: boolean;
        latencyMs: number;
        error: string | null;
        testedAt: string;
      }>;
      testedAt: string;
      summary: { total: number; passed: number; failed: number };
    }>("/api/providers/test-batch", { method: "POST", body: JSON.stringify({ mode }) }),
    getModels: (id: string) => request<{
      provider: string;
      alias: string;
      models: Array<{ id: string; name?: string; type?: string }>;
    }>(`/api/providers/${id}/models`),
    fetchModels: (id: string) => request<{
      success: boolean;
      provider: string;
      alias: string;
      count: number;
      models: Array<{ id: string; name: string }>;
    }>(`/api/providers/${id}/fetch-models`, { method: "POST" }),
  },

  // ─── Provider Nodes ─────────────────────────────────────────────────────────
  nodes: {
    validate: (data: unknown) => request("/api/provider-nodes/validate", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: { name?: string; baseUrl?: string; prefix?: string; apiType?: string }) =>
      request<{ node: ProviderNode }>(`/api/provider-nodes/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id: string) => request<{ success: boolean }>(`/api/provider-nodes/${id}`, { method: "DELETE" }),
  },

  // ─── API Keys ─────────────────────────────────────────────────────────────
  keys: {
    list:    () => request<{ keys: unknown[] }>("/api/keys"),
    create:  (name: string, userId?: string | null) => request("/api/keys", { method: "POST", body: JSON.stringify({ name, ...(userId ? { userId } : {}) }) }),
    update:  (id: string, data: unknown) => request(`/api/keys/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove:  (id: string) => request(`/api/keys/${id}`, { method: "DELETE" }),
  },

  // ─── Users ────────────────────────────────────────────────────────────────
  users: {
    list: () => request<{ users: { id: string; username: string; role: string; createdAt: string }[] }>("/api/users"),
    create: (username: string, password: string, role: string) =>
      request<{ id: string; username: string; role: string; createdAt: string }>("/api/users", {
        method: "POST",
        body: JSON.stringify({ username, password, role }),
      }),
    changePassword: (id: string, password: string) =>
      request(`/api/users/${id}/password`, { method: "PUT", body: JSON.stringify({ password }) }),
    remove: (id: string) => request(`/api/users/${id}`, { method: "DELETE" }),
  },

  // ─── Usage ────────────────────────────────────────────────────────────────
  usage: {
    stats:         (period = "24h") => request<unknown>(`/api/usage/stats?period=${period}`),
    requestDetails: (params: Record<string, string> = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request<{ rows: unknown[]; total: number }>(`/api/usage/request-details${qs ? `?${qs}` : ""}`);
    },
    leaderboard:   (period = "24h") => request<{
      leaderboard: Array<{
        userId: string;
        username: string;
        role: string;
        totalTokens: number;
        promptTokens: number;
        completionTokens: number;
        reasoningTokens: number;
        totalCost: number;
        requestCount: number;
      }>;
    }>(`/api/usage/leaderboard?period=${period}`),
  },

  // ─── Console Logs ─────────────────────────────────────────────────────────
  consoleLogs: {
    list:  () => request<unknown[]>("api/console-logs"),
    clear: () => request("api/console-logs", { method: "DELETE" }),
  },

  // ─── Settings ─────────────────────────────────────────────────────────────
  settings: {
    get:    () => request<unknown>("/api/settings"),
    update: (data: unknown) => request("/api/settings", { method: "PUT", body: JSON.stringify(data) }),
  },

  // ─── Models ───────────────────────────────────────────────────────────────
  models: {
    list: () => request<{ data: { id: string; created: number; owned_by?: string; combo_models?: string[] }[] }>("/v1/models"),
  },

  // ─── Mavis (upstream mavis.io.vn) ─────────────────────────────────────────
  mavis: {
    getMe:    () => request<unknown>("/api/mavis/me"),
    getUsage: (range: string) => request<unknown>(`/api/mavis/usage?range=${range}`),
    refresh:  () => request("/api/mavis/refresh", { method: "POST" }),
  },

  // ─── Combos ───────────────────────────────────────────────────────────────
  combos: {
    list:    () => request<{ combos: { id: string; name: string; models: string[]; createdAt?: string; updatedAt?: string }[] }>("/api/combos"),
    create:  (data: { name: string; models?: Array<{ model: string; weight: number }> }) => request("/api/combos", { method: "POST", body: JSON.stringify(data) }),
    update:  (id: string, data: { name?: string; models?: Array<{ model: string; weight: number }> }) => request(`/api/combos/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove:  (id: string) => request(`/api/combos/${id}`, { method: "DELETE" }),
  },

  // ─── ZAI (upstream api.z.ai) ───────────────────────────────────────────────
  zai: {
    getQuota: () => request<import("./zaiTypes.ts").ZaiQuotaResponse>("/api/zai/quota"),
    getPerformance: (start: string, end: string) =>
      request<import("./zaiTypes.ts").ZaiPerformanceResponse>(
        `/api/zai/performance?startTime=${encodeURIComponent(start)}&endTime=${encodeURIComponent(end)}`
      ),
    getUsage: (start: string, end: string) =>
      request<import("./zaiTypes.ts").ZaiUsageResponse>(
        `/api/zai/usage?startTime=${encodeURIComponent(start)}&endTime=${encodeURIComponent(end)}`
      ),
  },

  // ─── Pro-X (upstream pro-x.io.vn) ───────────────────────────────────────
  prox: {
    listKeys:  () => request<{ keys: { id: string; maskedName: string }[] }>("/api/prox/keys"),
    getStatus:  (key?: string) => {
      const qs = key ? `?key=${encodeURIComponent(key)}` : "";
      return request<import("./proxTypes.ts").ProxStatus>(`/api/prox/status${qs}`);
    },
    getSummary: (days?: number, key?: string) => {
      const params = new URLSearchParams();
      if (days !== undefined) params.set("days", String(days));
      if (key) params.set("key", key);
      const qs = params.toString() ? `?${params}` : "";
      return request<import("./proxTypes.ts").ProxSummary>(`/api/prox/summary${qs}`);
    },
    getChart:   (days?: number, key?: string) => {
      const params = new URLSearchParams();
      if (days !== undefined) params.set("days", String(days));
      if (key) params.set("key", key);
      const qs = params.toString() ? `?${params}` : "";
      return request<import("./proxTypes.ts").ProxChart>(`/api/prox/chart${qs}`);
    },
    getRecent:  (page = 1, limit = 15, key?: string) => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (key) params.set("key", key);
      return request<import("./proxTypes.ts").ProxRecent>(`/api/prox/recent?${params}`);
    },
  },
};
