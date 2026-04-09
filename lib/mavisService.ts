/**
 * Mavis Service — server-side proxy for mavis.io.vn API.
 *
 * Handles login session management (lazy, in-memory) so credentials
 * never leave the server. All functions auto-retry once on 401.
 */

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface MavisUserProfile {
  id: number;
  username: string;
  isAdmin: boolean;
  quota: number;
  usedQuota: number;
  requestCount: number;
  group: string;
  role: number;
  status: number;
  isUnlimited: boolean;
  planId: number;
  planName: string;
  planType: string;
  planAllowance: number;
  planPeriod: string;
  planDuration: string;
  periodUsedQuota: number;
  periodResetAt: string;
}

export interface MavisModelPricing {
  model: string;
  input_ratio: number;
  output_ratio: number;
}

export interface MavisTimeseriesPoint {
  time: string;
  requests: number;
  tokens: number;
  failures: number;
}

export interface MavisModelTimeseries {
  time: string;
  model: string;
  requests: number;
  tokens: number;
}

export interface MavisUsageModel {
  model: string;
  api_key: string;
  requests: number;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  failures: number;
}

export interface MavisUsageSummary {
  total_requests: number;
  success_count: number;
  failure_count: number;
  total_tokens: number;
}

export interface MavisUsageResponse {
  all_time: MavisUsageSummary;
  is_unlimited: boolean;
  model_pricing: MavisModelPricing[];
  model_timeseries: MavisModelTimeseries[];
  models: MavisUsageModel[];
  period_reset_at: string;
  period_used_quota: number;
  plan_allowance: number;
  plan_duration: string;
  plan_id: number;
  plan_name: string;
  plan_period: string;
  plan_type: string;
  quota: number;
  range: string;
  request_count: number;
  summary: MavisUsageSummary;
  timeseries: MavisTimeseriesPoint[];
  used_quota: number;
}

// ─── Session State ──────────────────────────────────────────────────────────────

interface SessionState {
  sessionCookie: string;
  expiresAt: number;
}

let _session: SessionState | null = null;

const MAVIS_BASE = (process.env.MAVIS_URL ?? "https://mavis.io.vn").replace(/\/$/, "");
const MAVIS_USER = process.env.MAVIS_USERNAME ?? "";
const MAVIS_PASS = process.env.MAVIS_PASSWORD ?? "";

// ─── Core helpers ───────────────────────────────────────────────────────────────

async function mavisFetch(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    Origin: MAVIS_BASE,
    Referer: `${MAVIS_BASE}/dashboard`,
    "X-Requested-With": "XMLHttpRequest",
    ...(init.headers as Record<string, string>),
  };

  if (_session?.sessionCookie) {
    headers["Cookie"] = _session.sessionCookie;
  }

  const url = path.startsWith("http") ? path : `${MAVIS_BASE}${path}`;
  const res = await fetch(url, { ...init, headers });

  if (res.status === 401 && retry && _session) {
    _session = null;
    return mavisFetch(path, init, false);
  }

  return res;
}

// ─── Public API ─────────────────────────────────────────────────────────────────

export async function login(): Promise<string> {
  const res = await fetch(`${MAVIS_BASE}/propilot/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "*/*" },
    body: JSON.stringify({ username: MAVIS_USER, password: MAVIS_PASS }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Mavis login failed (${res.status}): ${text}`);
  }

  const setCookie = res.headers.get("set-cookie") ?? "";
  const cookieMatch = setCookie.match(/^session=([^;]+)/i);
  if (!cookieMatch) throw new Error("No session cookie in mavis login response");

  const cookie = cookieMatch[0];
  _session = { sessionCookie: cookie, expiresAt: Date.now() };
  return cookie;
}

async function ensureSession(): Promise<string> {
  if (!_session) return login();
  return _session.sessionCookie;
}

export async function getMe(): Promise<MavisUserProfile> {
  await ensureSession();

  const res = await mavisFetch("/propilot/auth/me");
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Mavis /me failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<MavisUserProfile>;
}

export async function getUsage(range = "7d"): Promise<MavisUsageResponse> {
  await ensureSession();

  const res = await mavisFetch(`/api/usage?range=${encodeURIComponent(range)}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Mavis /usage failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<MavisUsageResponse>;
}

export async function refreshSession(): Promise<void> {
  _session = null;
  await login();
}
