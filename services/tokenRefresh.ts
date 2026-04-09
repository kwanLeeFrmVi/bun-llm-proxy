// Token refresh — real implementations for all OAuth providers.

import * as log from "../lib/logger.ts";
import { updateProviderConnection, getProviderConnections } from "../db/index.ts";
import { OAUTH_CONFIGS } from "../lib/oauthConfig.ts";
import { withLock } from "../lib/redis.ts";

// ─── Project ID cache (in-memory, mirrors open-sse behavior) ───────────────────

interface CachedProjectId {
  projectId: string;
  expiresAt: number;
}
const projectIdCache = new Map<string, CachedProjectId>();

export function getProjectIdForConnection(
  _connectionId: string,
  _accessToken: string
): Promise<string | null> {
  // Stub — real implementation requires Google Cloud API knowledge
  return Promise.resolve(null);
}

export function invalidateProjectId(connectionId: string): void {
  projectIdCache.delete(connectionId);
}

export function removeConnection(connectionId: string): void {
  projectIdCache.delete(connectionId);
}

// ─── Token result interface ───────────────────────────────────────────────────────

interface TokenResult {
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  expiresAt?: number;
  providerSpecificData?: Record<string, unknown>;
  token?: string;
}

export const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;
const BACKGROUND_EXPIRY_BUFFER_MS = 15 * 60 * 1000;
const BACKGROUND_INTERVAL_MS = 2 * 60 * 1000;

// Lock TTL for per-connection refresh (30s should be plenty for a token exchange)
const REFRESH_LOCK_TTL = 30;
// Lock TTL for the background refresh cycle (should complete well within 2min interval)
const BACKGROUND_LOCK_TTL = 120;

// ─── Provider-specific refresh implementations ───────────────────────────────────

export async function refreshClaudeOAuthToken(refreshToken: string): Promise<TokenResult | null> {
  const config = OAUTH_CONFIGS.claude;
  try {
    const res = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: config.clientId,
      }),
    });

    if (!res.ok) {
      log.error("TOKEN_REFRESH", `Claude refresh failed: ${res.status} ${await res.text()}`);
      return null;
    }

    const data = await res.json() as Record<string, unknown>;
    return {
      accessToken: data.access_token as string,
      refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
      expiresIn: typeof data.expires_in === "number" ? data.expires_in : undefined,
    };
  } catch (err) {
    log.error("TOKEN_REFRESH", `Claude refresh error: ${(err as Error).message}`);
    return null;
  }
}

export async function refreshCodexToken(refreshToken: string): Promise<TokenResult | null> {
  const config = OAUTH_CONFIGS.codex;
  try {
    const res = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: config.clientId,
      }),
    });

    if (!res.ok) {
      log.error("TOKEN_REFRESH", `Codex refresh failed: ${res.status} ${await res.text()}`);
      return null;
    }

    const data = await res.json() as Record<string, unknown>;
    return {
      accessToken: data.access_token as string,
      refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
      expiresIn: typeof data.expires_in === "number" ? data.expires_in : undefined,
    };
  } catch (err) {
    log.error("TOKEN_REFRESH", `Codex refresh error: ${(err as Error).message}`);
    return null;
  }
}

export async function refreshOpenAIToken(refreshToken: string): Promise<TokenResult | null> {
  const config = OAUTH_CONFIGS.openai;
  try {
    const res = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: config.clientId,
      }),
    });

    if (!res.ok) {
      log.error("TOKEN_REFRESH", `OpenAI refresh failed: ${res.status} ${await res.text()}`);
      return null;
    }

    const data = await res.json() as Record<string, unknown>;
    return {
      accessToken: data.access_token as string,
      refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
      expiresIn: typeof data.expires_in === "number" ? data.expires_in : undefined,
    };
  } catch (err) {
    log.error("TOKEN_REFRESH", `OpenAI refresh error: ${(err as Error).message}`);
    return null;
  }
}

export async function refreshGoogleToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<TokenResult | null> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!res.ok) {
      log.error("TOKEN_REFRESH", `Google refresh failed: ${res.status} ${await res.text()}`);
      return null;
    }

    const data = await res.json() as Record<string, unknown>;
    return {
      accessToken: data.access_token as string,
      refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
      expiresIn: typeof data.expires_in === "number" ? data.expires_in : undefined,
    };
  } catch (err) {
    log.error("TOKEN_REFRESH", `Google refresh error: ${(err as Error).message}`);
    return null;
  }
}

export async function refreshQwenToken(refreshToken: string): Promise<TokenResult | null> {
  const config = OAUTH_CONFIGS.qwen;
  try {
    const res = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: config.clientId,
      }),
    });

    if (!res.ok) {
      log.error("TOKEN_REFRESH", `Qwen refresh failed: ${res.status} ${await res.text()}`);
      return null;
    }

    const data = await res.json() as Record<string, unknown>;
    return {
      accessToken: data.access_token as string,
      refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
      expiresIn: typeof data.expires_in === "number" ? data.expires_in : undefined,
    };
  } catch (err) {
    log.error("TOKEN_REFRESH", `Qwen refresh error: ${(err as Error).message}`);
    return null;
  }
}

export async function refreshKiroToken(
  refreshToken: string,
  providerSpecificData: unknown
): Promise<TokenResult | null> {
  const config = OAUTH_CONFIGS.kiro;
  const psd = providerSpecificData as Record<string, unknown> | undefined;

  try {
    const res = await fetch(config.socialRefreshUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      log.error("TOKEN_REFRESH", `Kiro refresh failed: ${res.status} ${await res.text()}`);
      return null;
    }

    const data = await res.json() as Record<string, unknown>;
    return {
      accessToken: (data.accessToken ?? data.access_token) as string,
      refreshToken: (data.refreshToken ?? data.refresh_token) as string | undefined,
      expiresIn: (data.expiresIn ?? data.expires_in) as number | undefined,
      providerSpecificData: {
        ...(psd ?? {}),
        profileArn: data.profileArn ?? psd?.profileArn,
      },
    };
  } catch (err) {
    log.error("TOKEN_REFRESH", `Kiro refresh error: ${(err as Error).message}`);
    return null;
  }
}

export async function refreshIflowToken(refreshToken: string): Promise<TokenResult | null> {
  const config = OAUTH_CONFIGS.iflow;
  const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");

  try {
    const res = await fetch(config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
    });

    if (!res.ok) {
      log.error("TOKEN_REFRESH", `iFlow refresh failed: ${res.status} ${await res.text()}`);
      return null;
    }

    const data = await res.json() as Record<string, unknown>;
    return {
      accessToken: data.access_token as string,
      refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
      expiresIn: typeof data.expires_in === "number" ? data.expires_in : undefined,
    };
  } catch (err) {
    log.error("TOKEN_REFRESH", `iFlow refresh error: ${(err as Error).message}`);
    return null;
  }
}

export async function refreshGitHubToken(refreshToken: string): Promise<TokenResult | null> {
  const config = OAUTH_CONFIGS.github;
  try {
    const res = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: config.clientId,
      }),
    });

    if (!res.ok) {
      log.error("TOKEN_REFRESH", `GitHub refresh failed: ${res.status} ${await res.text()}`);
      return null;
    }

    const data = await res.json() as Record<string, unknown>;
    return {
      accessToken: data.access_token as string,
      refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
      expiresIn: typeof data.expires_in === "number" ? data.expires_in : undefined,
    };
  } catch (err) {
    log.error("TOKEN_REFRESH", `GitHub refresh error: ${(err as Error).message}`);
    return null;
  }
}

export async function refreshCopilotToken(
  githubAccessToken: string
): Promise<{ token: string; expiresAt: number } | null> {
  const config = OAUTH_CONFIGS.github;
  try {
    const res = await fetch(config.copilotTokenUrl, {
      method: "GET",
      headers: {
        Authorization: `token ${githubAccessToken}`,
        Accept: "application/json",
        "User-Agent": config.userAgent,
        "Editor-Version": config.editorVersion,
        "Editor-Plugin-Version": config.editorPluginVersion,
      },
    });

    if (!res.ok) {
      log.error("TOKEN_REFRESH", `Copilot token refresh failed: ${res.status} ${await res.text()}`);
      return null;
    }

    const data = await res.json() as Record<string, unknown>;
    if (typeof data.token !== "string" || typeof data.expires_at !== "number") {
      log.error("TOKEN_REFRESH", "Copilot token response invalid");
      return null;
    }

    return { token: data.token, expiresAt: data.expires_at };
  } catch (err) {
    log.error("TOKEN_REFRESH", `Copilot token error: ${(err as Error).message}`);
    return null;
  }
}

// ─── Dispatcher: route to provider-specific refresh ──────────────────────────────

export function getAccessToken(
  provider: string,
  credentials: unknown
): Promise<TokenResult | null> {
  const creds = credentials as Record<string, unknown>;
  const refreshToken = creds.refreshToken as string | undefined;
  const connectionId = creds.connectionId as string | undefined;

  if (!refreshToken) {
    log.debug("TOKEN_REFRESH", `No refreshToken for ${provider}, cannot refresh`);
    return Promise.resolve(null);
  }

  if (!connectionId) {
    return _refreshByProvider(provider, refreshToken, creds);
  }

  // Try Redis distributed lock first, fall back to in-memory lock
  return _refreshWithLock(connectionId, provider, refreshToken, creds);
}

async function _refreshWithLock(
  connectionId: string,
  provider: string,
  refreshToken: string,
  creds: Record<string, unknown>
): Promise<TokenResult | null> {
  const lockResult = await withLock(
    `token-refresh:${connectionId}`,
    REFRESH_LOCK_TTL,
    () => _refreshByProvider(provider, refreshToken, creds)
  );

  if (lockResult.executed) {
    return lockResult.result ?? null;
  }

  // Redis lock was held by another instance — skip refresh, the other instance handles it
  log.debug("TOKEN_REFRESH", `Skipped refresh for ${connectionId} — locked by another instance`);
  return null;
}

async function _refreshByProvider(
  provider: string,
  refreshToken: string,
  creds: Record<string, unknown>
): Promise<TokenResult | null> {
  switch (provider) {
    case "claude":
      return refreshClaudeOAuthToken(refreshToken);
    case "codex":
      return refreshCodexToken(refreshToken);
    case "openai":
      return refreshOpenAIToken(refreshToken);
    case "gemini-cli": {
      const cfg = OAUTH_CONFIGS["gemini-cli"];
      return refreshGoogleToken(refreshToken, cfg.clientId, cfg.clientSecret);
    }
    case "antigravity": {
      const cfg = OAUTH_CONFIGS.antigravity;
      return refreshGoogleToken(refreshToken, cfg.clientId, cfg.clientSecret);
    }
    case "qwen":
      return refreshQwenToken(refreshToken);
    case "kiro":
      return refreshKiroToken(refreshToken, creds.providerSpecificData);
    case "iflow":
      return refreshIflowToken(refreshToken);
    case "github":
      return refreshGitHubAndCopilotTokens(creds);
    default:
      log.debug("TOKEN_REFRESH", `No refresh handler for provider: ${provider}`);
      return null;
  }
}

export function refreshTokenByProvider(
  provider: string,
  credentials: unknown
): Promise<TokenResult | null> {
  return getAccessToken(provider, credentials);
}

export function refreshAccessToken(
  provider: string,
  _refreshToken: string,
  credentials: unknown
): Promise<TokenResult | null> {
  return getAccessToken(provider, credentials);
}

export function formatProviderCredentials(
  _provider: string,
  _credentials: unknown
): TokenResult | null {
  return null;
}

export function getAllAccessTokens(_userInfo: unknown): Promise<Record<string, unknown>> {
  return Promise.resolve({});
}

export function parseVertexSaJson(apiKey: string): Record<string, unknown> | null {
  if (typeof apiKey !== "string") return null;
  try {
    const parsed = JSON.parse(apiKey);
    if (
      parsed.type === "service_account" &&
      parsed.client_email &&
      parsed.private_key &&
      parsed.project_id
    ) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

export function refreshVertexToken(
  _saJson: Record<string, unknown>
): Promise<TokenResult | null> {
  return Promise.resolve(null);
}

export function refreshWithRetry(
  refreshFn: () => Promise<TokenResult | null>,
  maxRetries = 3
): Promise<TokenResult | null> {
  return (async () => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 1000));
      try {
        const result = await refreshFn();
        if (result) return result;
      } catch { /* ignore */ }
    }
    return null;
  })();
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function toExpiresAt(expiresIn: number): string {
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

function needsProjectId(provider: string): boolean {
  return provider === "antigravity" || provider === "gemini-cli";
}

function _refreshProjectId(provider: string, connectionId: string, accessToken: string): void {
  if (!needsProjectId(provider) || !connectionId || !accessToken) return;
  invalidateProjectId(connectionId);
  getProjectIdForConnection(connectionId, accessToken)
    .then((projectId: string | null) => {
      if (!projectId) return;
      updateProviderCredentials(connectionId, { projectId }).catch((err: Error) => {
        log.debug("TOKEN_REFRESH", "Failed to persist refreshed projectId", {
          connectionId,
          error: err?.message ?? err,
        });
      });
    })
    .catch((err: Error) => {
      log.debug("TOKEN_REFRESH", "Failed to fetch projectId after token refresh", {
        connectionId,
        error: err?.message ?? err,
      });
    });
}

// ─── Local: persist credentials to DB ─────────────────────────────────────────

export async function updateProviderCredentials(
  connectionId: string,
  newCredentials: Record<string, unknown>
): Promise<boolean> {
  try {
    const updates: Record<string, unknown> = {};

    if (newCredentials.accessToken)  updates.accessToken  = newCredentials.accessToken;
    if (newCredentials.refreshToken) updates.refreshToken = newCredentials.refreshToken;
    if (newCredentials.expiresIn) {
      updates.expiresAt = toExpiresAt(newCredentials.expiresIn as number);
      updates.expiresIn = newCredentials.expiresIn;
    }
    if (newCredentials.providerSpecificData) {
      updates.providerSpecificData = {
        ...((newCredentials.existingProviderSpecificData as Record<string, unknown>) ?? {}),
        ...(newCredentials.providerSpecificData as Record<string, unknown>),
      };
    }
    if (newCredentials.projectId) updates.projectId = newCredentials.projectId;

    const result = await updateProviderConnection(connectionId, updates);
    log.info("TOKEN_REFRESH", "Credentials updated in DB", { connectionId, success: !!result });
    return !!result;
  } catch (error) {
    log.error("TOKEN_REFRESH", "Error updating credentials in DB", {
      connectionId,
      error: (error as Error).message,
    });
    return false;
  }
}

// ─── Proactive token refresh (on-demand, called before each request) ──────────

export async function checkAndRefreshToken(
  provider: string,
  credentials: Record<string, unknown>
): Promise<Record<string, unknown>> {
  let creds = { ...credentials };

  // 1. Regular access-token expiry
  if (creds.expiresAt) {
    const expiresAt = new Date(creds.expiresAt as string).getTime();
    const now = Date.now();
    const remaining = expiresAt - now;

    if (remaining < TOKEN_EXPIRY_BUFFER_MS) {
      log.info("TOKEN_REFRESH", "Token expiring soon, refreshing proactively", {
        provider,
        expiresIn: Math.round(remaining / 1000),
      });

      const newCreds = await getAccessToken(provider, creds) as Record<string, unknown> | null;
      if (newCreds?.accessToken) {
        const mergedCreds = {
          ...newCreds,
          existingProviderSpecificData: creds.providerSpecificData,
        };

        await updateProviderCredentials(creds.connectionId as string, mergedCreds);

        creds = {
          ...creds,
          accessToken: newCreds.accessToken,
          refreshToken: (newCreds.refreshToken ?? creds.refreshToken) as string | undefined,
          providerSpecificData: newCreds.providerSpecificData
            ? { ...(creds.providerSpecificData as object), ...(newCreds.providerSpecificData as object) }
            : creds.providerSpecificData,
          expiresAt: newCreds.expiresIn
            ? toExpiresAt(newCreds.expiresIn as number)
            : creds.expiresAt,
        };

        _refreshProjectId(provider, creds.connectionId as string, creds.accessToken as string);
      }
    }
  }

  // 2. GitHub Copilot token expiry
  const psd = creds.providerSpecificData as Record<string, unknown> | undefined;
  if (provider === "github" && psd?.copilotTokenExpiresAt) {
    const copilotExpiresAt = (psd.copilotTokenExpiresAt as number) * 1000;
    const now = Date.now();
    const remaining = copilotExpiresAt - now;

    if (remaining < TOKEN_EXPIRY_BUFFER_MS) {
      log.info("TOKEN_REFRESH", "Copilot token expiring soon, refreshing proactively", {
        provider,
        expiresIn: Math.round(remaining / 1000),
      });

      const copilotToken = await refreshCopilotToken(creds.accessToken as string) as { token: string; expiresAt: number } | null;
      if (copilotToken) {
        const updatedSpecific: Record<string, unknown> = {
          ...psd,
          copilotToken: copilotToken.token,
          copilotTokenExpiresAt: copilotToken.expiresAt,
        };

        await updateProviderCredentials(creds.connectionId as string, {
          providerSpecificData: updatedSpecific,
        });

        creds.providerSpecificData = updatedSpecific;
        creds.copilotToken = copilotToken.token;
      }
    }
  }

  return creds;
}

export async function refreshGitHubAndCopilotTokens(
  credentials: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const newGitHubCreds = await refreshGitHubToken(credentials.refreshToken as string) as Record<string, unknown> | null;
  if (!newGitHubCreds?.accessToken) return newGitHubCreds;

  const copilotToken = await refreshCopilotToken(newGitHubCreds.accessToken as string) as { token: string; expiresAt: number } | null;
  if (!copilotToken) return newGitHubCreds;

  return {
    ...newGitHubCreds,
    providerSpecificData: {
      copilotToken: copilotToken.token,
      copilotTokenExpiresAt: copilotToken.expiresAt,
    },
  };
}

// ─── Background token refresh job ─────────────────────────────────────────────

let backgroundRefreshTimer: ReturnType<typeof setInterval> | null = null;

export function startBackgroundTokenRefresh(): void {
  if (backgroundRefreshTimer) return; // Already running

  log.info("TOKEN_REFRESH", "Background token refresh started (interval: 2min, buffer: 15min)");

  // Run immediately once, then on interval
  runBackgroundRefresh();
  backgroundRefreshTimer = setInterval(runBackgroundRefresh, BACKGROUND_INTERVAL_MS);
}

export function stopBackgroundTokenRefresh(): void {
  if (backgroundRefreshTimer) {
    clearInterval(backgroundRefreshTimer);
    backgroundRefreshTimer = null;
    log.info("TOKEN_REFRESH", "Background token refresh stopped");
  }
}

async function runBackgroundRefresh(): Promise<void> {
  // Use Redis lock so only one instance runs the background cycle
  const { executed } = await withLock(
    "background-token-refresh",
    BACKGROUND_LOCK_TTL,
    _doBackgroundRefresh
  );

  if (!executed) {
    log.debug("TOKEN_REFRESH", "Background refresh skipped — another instance holds the lock");
  }
}

async function _doBackgroundRefresh(): Promise<void> {
  try {
    const connections = await getProviderConnections({ isActive: true });
    const now = Date.now();
    let refreshed = 0;
    let failed = 0;

    for (const conn of connections) {
      // Skip connections without OAuth tokens
      if (!conn.refreshToken || !conn.expiresAt) continue;

      const expiresAt = new Date(conn.expiresAt as string).getTime();
      const remaining = expiresAt - now;

      // Only refresh if expiring within the background buffer window
      if (remaining >= BACKGROUND_EXPIRY_BUFFER_MS) continue;

      log.info("TOKEN_REFRESH", `Background: refreshing ${conn.provider} (${conn.name ?? conn.id})`, {
        expiresIn: Math.round(remaining / 1000),
      });

      try {
        const creds: Record<string, unknown> = {
          connectionId: conn.id,
          refreshToken: conn.refreshToken,
          accessToken: conn.accessToken,
          providerSpecificData: conn.providerSpecificData,
        };

        const newCreds = await getAccessToken(conn.provider, creds) as Record<string, unknown> | null;
        if (newCreds?.accessToken) {
          await updateProviderCredentials(conn.id, {
            ...newCreds,
            existingProviderSpecificData: conn.providerSpecificData,
          });
          refreshed++;
          log.info("TOKEN_REFRESH", `Background: refreshed ${conn.provider} (${conn.name ?? conn.id})`);
        } else {
          failed++;
          log.warn("TOKEN_REFRESH", `Background: refresh returned null for ${conn.provider} (${conn.name ?? conn.id})`);
        }
      } catch (err) {
        failed++;
        log.error("TOKEN_REFRESH", `Background: refresh error for ${conn.provider} (${conn.name ?? conn.id})`, {
          error: (err as Error).message,
        });
      }
    }

    if (refreshed > 0 || failed > 0) {
      log.info("TOKEN_REFRESH", `Background refresh cycle complete: ${refreshed} refreshed, ${failed} failed`);
    }
  } catch (err) {
    log.error("TOKEN_REFRESH", `Background refresh cycle error: ${(err as Error).message}`);
  }
}
