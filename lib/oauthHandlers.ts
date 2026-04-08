// ─── Server-side OAuth flow handlers ──────────────────────────────────────────
// Handles device code requests, token polling, code exchange, and connection saving.

import { OAUTH_CONFIGS, generatePKCE, type OAuthProviderId, type QwenConfig, type KiroConfig } from "./oauthConfig.ts";
import { createProviderConnection } from "../db/index.ts";

// ─── Device Code Flow ──────────────────────────────────────────────────────────────

export interface DeviceCodeResult {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
  codeVerifier: string;
  // Kiro-specific: client creds for polling
  _clientId?: string;
  _clientSecret?: string;
}

export async function requestDeviceCode(
  provider: OAuthProviderId,
  idcConfig?: { startUrl?: string; region?: string }
): Promise<DeviceCodeResult> {
  const config = OAUTH_CONFIGS[provider];
  if (!config) throw new Error(`Unknown OAuth provider: ${provider}`);

  if (provider === "qwen") {
    return requestQwenDeviceCode(config);
  }
  if (provider === "kiro") {
    return requestKiroDeviceCode(config, idcConfig);
  }
  throw new Error(`Provider ${provider} does not support device code flow`);
}

async function requestQwenDeviceCode(config: QwenConfig): Promise<DeviceCodeResult> {
  const { codeVerifier, codeChallenge } = generatePKCE();

  const res = await fetch(config.deviceCodeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: config.clientId,
      scope: config.scope,
      code_challenge: codeChallenge,
      code_challenge_method: config.codeChallengeMethod,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Qwen device code request failed: ${err}`);
  }

  const data = await res.json();
  return {
    device_code: data.device_code,
    user_code: data.user_code,
    verification_uri: data.verification_uri,
    verification_uri_complete: data.verification_uri_complete,
    expires_in: data.expires_in,
    interval: data.interval || 5,
    codeVerifier,
  };
}

async function requestKiroDeviceCode(
  config: KiroConfig,
  idcConfig?: { startUrl?: string; region?: string }
): Promise<DeviceCodeResult> {
  const region = idcConfig?.region || "us-east-1";
  const startUrl = idcConfig?.startUrl || config.startUrl;

  // Step 1: Register client with AWS SSO OIDC
  const registerEndpoint = `https://oidc.${region}.amazonaws.com/client/register`;
  const registerRes = await fetch(registerEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      clientName: config.clientName,
      clientType: config.clientType,
      scopes: config.scopes,
      grantTypes: config.grantTypes,
      issuerUrl: config.issuerUrl,
    }),
  });

  if (!registerRes.ok) {
    const err = await registerRes.text();
    throw new Error(`Kiro client registration failed: ${err}`);
  }

  const clientInfo = await registerRes.json() as { clientId: string; clientSecret: string };

  // Step 2: Request device authorization
  const deviceEndpoint = `https://oidc.${region}.amazonaws.com/device_authorization`;
  const deviceRes = await fetch(deviceEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      clientId: clientInfo.clientId,
      clientSecret: clientInfo.clientSecret,
      startUrl,
    }),
  });

  if (!deviceRes.ok) {
    const err = await deviceRes.text();
    throw new Error(`Kiro device authorization failed: ${err}`);
  }

  const deviceData = await deviceRes.json() as { deviceCode: string; userCode: string; verificationUri: string; verificationUriComplete: string; expiresIn: number; interval?: number };

  return {
    device_code: deviceData.deviceCode,
    user_code: deviceData.userCode,
    verification_uri: deviceData.verificationUri,
    verification_uri_complete: deviceData.verificationUriComplete,
    expires_in: deviceData.expiresIn,
    interval: deviceData.interval || 5,
    codeVerifier: "", // Kiro doesn't use PKCE for device code
    _clientId: clientInfo.clientId,
    _clientSecret: clientInfo.clientSecret,
  };
}

// ─── Token Polling ──────────────────────────────────────────────────────────────────

export interface PollResult {
  success: boolean;
  error?: string;
  errorDescription?: string;
  tokens?: {
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
    [key: string]: unknown;
  };
}

export async function pollDeviceToken(
  provider: OAuthProviderId,
  deviceCode: string,
  codeVerifier: string,
  extraData?: Record<string, unknown>
): Promise<PollResult> {
  const config = OAUTH_CONFIGS[provider];

  if (provider === "qwen") {
    return pollQwenToken(config, deviceCode, codeVerifier);
  }
  if (provider === "kiro") {
    return pollKiroToken(config, deviceCode, extraData);
  }
  throw new Error(`Provider ${provider} does not support device code polling`);
}

async function pollQwenToken(
  config: typeof OAUTH_CONFIGS.qwen,
  deviceCode: string,
  codeVerifier: string
): Promise<PollResult> {
  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      client_id: config.clientId,
      device_code: deviceCode,
      code_verifier: codeVerifier,
    }),
  });

  const data = await res.json();

  if (res.ok) {
    return {
      success: true,
      tokens: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
        resourceUrl: data.resource_url,
      },
    };
  }

  // Pending/slow_down = keep polling
  if (data.error === "authorization_pending" || data.error === "slow_down") {
    return { success: false, error: data.error };
  }
  return { success: false, error: data.error, errorDescription: data.error_description };
}

async function pollKiroToken(
  config: typeof OAUTH_CONFIGS.kiro,
  deviceCode: string,
  extraData?: Record<string, unknown>
): Promise<PollResult> {
  const clientId = extraData?._clientId as string;
  const clientSecret = extraData?._clientSecret as string;
  const region = (extraData?.region as string) || "us-east-1";

  const endpoint = `https://oidc.${region}.amazonaws.com/token`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      clientId,
      clientSecret,
      deviceCode,
      grantType: "urn:ietf:params:oauth:grant-type:device_code",
    }),
  });

  let data: Record<string, unknown>;
  try {
    data = await res.json();
  } catch {
    const text = await res.text();
    data = { error: "invalid_response", error_description: text };
  }

  // AWS SSO OIDC returns camelCase
  if (res.ok && data.accessToken) {
    return {
      success: true,
      tokens: {
        accessToken: data.accessToken as string,
        refreshToken: data.refreshToken as string,
        expiresIn: data.expiresIn as number,
        profileArn: data.profileArn,
        _clientId: clientId,
        _clientSecret: clientSecret,
      },
    };
  }

  const error = (data.error as string) || "authorization_pending";
  return { success: false, error, errorDescription: data.error_description as string };
}

// ─── Authorization Code Flow ────────────────────────────────────────────────────────

export interface AuthorizeResult {
  authUrl: string;
  state: string;
  codeVerifier: string;
  redirectUri: string;
}

export async function buildAuthorizeUrl(
  provider: OAuthProviderId,
  redirectUri: string
): Promise<AuthorizeResult> {
  const config = OAUTH_CONFIGS[provider];
  if (!config) throw new Error(`Unknown OAuth provider: ${provider}`);

  if (provider === "claude") {
    return buildClaudeAuthorizeUrl(config, redirectUri);
  }
  if (provider === "codex") {
    return buildCodexAuthorizeUrl(config, redirectUri);
  }
  if (provider === "openai") {
    return buildOpenAIAuthorizeUrl(config, redirectUri);
  }
  if (provider === "gemini-cli") {
    return buildGeminiAuthorizeUrl(config, redirectUri);
  }
  if (provider === "iflow") {
    return buildIflowAuthorizeUrl(config, redirectUri);
  }
  if (provider === "antigravity") {
    return buildAntigravityAuthorizeUrl(config, redirectUri);
  }
  throw new Error(`Provider ${provider} does not support authorization code flow`);
}

function buildClaudeAuthorizeUrl(
  config: typeof OAUTH_CONFIGS.claude,
  redirectUri: string
): AuthorizeResult {
  const { codeVerifier, codeChallenge, state } = generatePKCE();
  const params = new URLSearchParams({
    code: "true",
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: config.scopes.join(" "),
    code_challenge: codeChallenge,
    code_challenge_method: config.codeChallengeMethod,
    state,
  });
  return { authUrl: `${config.authorizeUrl}?${params.toString()}`, state, codeVerifier, redirectUri };
}

function buildGeminiAuthorizeUrl(
  config: typeof OAUTH_CONFIGS["gemini-cli"],
  redirectUri: string
): AuthorizeResult {
  const state = generatePKCE().state;
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: config.scopes.join(" "),
    state,
    access_type: "offline",
    prompt: "consent",
  });
  return { authUrl: `${config.authorizeUrl}?${params.toString()}`, state, codeVerifier: "", redirectUri };
}

function buildIflowAuthorizeUrl(
  config: typeof OAUTH_CONFIGS.iflow,
  redirectUri: string
): AuthorizeResult {
  const state = generatePKCE().state;
  const params = new URLSearchParams({
    loginMethod: config.extraParams.loginMethod,
    type: config.extraParams.type,
    redirect: redirectUri,
    state,
    client_id: config.clientId,
  });
  return { authUrl: `${config.authorizeUrl}?${params.toString()}`, state, codeVerifier: "", redirectUri };
}

function buildCodexAuthorizeUrl(
  config: typeof OAUTH_CONFIGS.codex,
  redirectUri: string
): AuthorizeResult {
  const { codeVerifier, codeChallenge, state } = generatePKCE();
  const params = new URLSearchParams({
    code: "true",
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: config.scope,
    code_challenge: codeChallenge,
    code_challenge_method: config.codeChallengeMethod,
    state,
    ...config.extraParams,
  });
  return { authUrl: `${config.authorizeUrl}?${params.toString()}`, state, codeVerifier, redirectUri };
}

function buildOpenAIAuthorizeUrl(
  config: typeof OAUTH_CONFIGS.openai,
  redirectUri: string
): AuthorizeResult {
  const { codeVerifier, codeChallenge, state } = generatePKCE();
  const params = new URLSearchParams({
    code: "true",
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: config.scope,
    code_challenge: codeChallenge,
    code_challenge_method: config.codeChallengeMethod,
    state,
    ...config.extraParams,
  });
  return { authUrl: `${config.authorizeUrl}?${params.toString()}`, state, codeVerifier, redirectUri };
}

function buildAntigravityAuthorizeUrl(
  config: typeof OAUTH_CONFIGS.antigravity,
  redirectUri: string
): AuthorizeResult {
  const state = generatePKCE().state;
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: config.scopes.join(" "),
    state,
    access_type: "offline",
    prompt: "consent",
  });
  return { authUrl: `${config.authorizeUrl}?${params.toString()}`, state, codeVerifier: "", redirectUri };
}

// ─── Token Exchange ─────────────────────────────────────────────────────────────────

export interface ExchangeResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  email?: string;
  [key: string]: unknown;
}

export async function exchangeCode(
  provider: OAuthProviderId,
  code: string,
  redirectUri: string,
  codeVerifier?: string,
  state?: string
): Promise<ExchangeResult> {
  const config = OAUTH_CONFIGS[provider];

  if (provider === "claude") {
    return exchangeClaudeCode(config, code, redirectUri, codeVerifier, state);
  }
  if (provider === "gemini-cli") {
    return exchangeGeminiCode(config, code, redirectUri);
  }
  if (provider === "iflow") {
    return exchangeIflowCode(config, code, redirectUri);
  }
  throw new Error(`Provider ${provider} does not support code exchange`);
}

async function exchangeClaudeCode(
  config: typeof OAUTH_CONFIGS.claude,
  code: string,
  redirectUri: string,
  codeVerifier?: string,
  state?: string
): Promise<ExchangeResult> {
  // Claude code may contain state after #
  let authCode = code;
  let codeState = "";
  if (authCode.includes("#")) {
    const parts = authCode.split("#");
    authCode = parts[0];
    codeState = parts[1] || "";
  }

  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      code: authCode,
      state: codeState || state,
      grant_type: "authorization_code",
      client_id: config.clientId,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude token exchange failed: ${err}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    scope: data.scope,
  };
}

async function exchangeGeminiCode(
  config: typeof OAUTH_CONFIGS["gemini-cli"],
  code: string,
  redirectUri: string
): Promise<ExchangeResult> {
  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini token exchange failed: ${err}`);
  }

  const data = await res.json();

  // Fetch user info
  let email: string | undefined;
  try {
    const userRes = await fetch(`${config.userInfoUrl}?alt=json`, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    if (userRes.ok) {
      const userInfo = await userRes.json();
      email = userInfo.email;
    }
  } catch { /* non-critical */ }

  // Fetch project ID
  let projectId: string | undefined;
  try {
    const projectRes = await fetch(config.codeAssistUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${data.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ metadata: {}, mode: 1 }),
    });
    if (projectRes.ok) {
      const projectData = await projectRes.json();
      projectId =
        typeof projectData.cloudaicompanionProject === "string"
          ? projectData.cloudaicompanionProject.trim()
          : projectData.cloudaicompanionProject?.id?.trim();
    }
  } catch { /* non-critical */ }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    email,
    projectId,
  };
}

async function exchangeIflowCode(
  config: typeof OAUTH_CONFIGS.iflow,
  code: string,
  redirectUri: string
): Promise<ExchangeResult> {
  const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");

  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`iFlow token exchange failed: ${err}`);
  }

  const data = await res.json();

  // Fetch user info (includes API key)
  let email: string | undefined;
  let apiKey: string | undefined;
  try {
    const userRes = await fetch(`${config.userInfoUrl}?accessToken=${encodeURIComponent(data.access_token)}`, {
      headers: { Accept: "application/json" },
    });
    if (userRes.ok) {
      const result = await userRes.json();
      if (result.success && result.data) {
        email = result.data.email || result.data.phone;
        apiKey = result.data.apiKey;
      }
    }
  } catch { /* non-critical */ }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    email,
    apiKey,
  };
}

// ─── Kiro Social Login ──────────────────────────────────────────────────────────────

export interface KiroSocialAuthorizeResult {
  authUrl: string;
  state: string;
  codeVerifier: string;
  codeChallenge: string;
}

export async function buildKiroSocialAuthorizeUrl(
  socialProvider: "google" | "github"
): Promise<KiroSocialAuthorizeResult> {
  const config = OAUTH_CONFIGS.kiro;
  const { codeVerifier, codeChallenge, state } = generatePKCE();

  const idp = socialProvider === "google" ? "Google" : "Github";
  const redirectUri = "kiro://kiro.kiroAgent/authenticate-success";
  const authUrl = `${config.socialLoginUrl}?idp=${idp}&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=${codeChallenge}&code_challenge_method=S256&state=${state}&prompt=select_account`;

  return { authUrl, state, codeVerifier, codeChallenge };
}

export async function exchangeKiroSocialCode(
  code: string,
  codeVerifier: string
): Promise<ExchangeResult> {
  const config = OAUTH_CONFIGS.kiro;
  const redirectUri = "kiro://kiro.kiroAgent/authenticate-success";

  const res = await fetch(config.socialTokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, code_verifier: codeVerifier, redirect_uri: redirectUri }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kiro social token exchange failed: ${err}`);
  }

  const data = await res.json();
  return {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresIn: data.expiresIn || 3600,
    profileArn: data.profileArn,
  };
}

// ─── iFlow Cookie Auth ──────────────────────────────────────────────────────────────

export async function iflowCookieAuth(cookie: string): Promise<ExchangeResult> {
  const trimmed = cookie.trim();
  if (!trimmed.includes("BXAuth=")) {
    throw new Error("Cookie must contain BXAuth field");
  }

  let normalizedCookie = trimmed;
  if (!normalizedCookie.endsWith(";")) normalizedCookie += ";";

  // Step 1: GET API key info
  const getRes = await fetch("https://platform.iflow.cn/api/openapi/apikey", {
    method: "GET",
    headers: {
      Cookie: normalizedCookie,
      Accept: "application/json, text/plain, */*",
      "User-Agent": "Mozilla/5.0",
    },
  });

  if (!getRes.ok) throw new Error("Failed to fetch iFlow API key info");
  const getResult = await getRes.json();
  if (!getResult.success) throw new Error(`iFlow API key fetch failed: ${getResult.message}`);

  const keyData = getResult.data;

  // Step 2: POST to refresh API key
  const postRes = await fetch("https://platform.iflow.cn/api/openapi/apikey", {
    method: "POST",
    headers: {
      Cookie: normalizedCookie,
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: "https://platform.iflow.cn",
      Referer: "https://platform.iflow.cn/",
    },
    body: JSON.stringify({ name: keyData.name }),
  });

  if (!postRes.ok) throw new Error("Failed to refresh iFlow API key");
  const postResult = await postRes.json();
  if (!postResult.success) throw new Error(`iFlow API key refresh failed: ${postResult.message}`);

  const refreshedKey = postResult.data;

  // Extract BXAuth
  const bxAuthMatch = normalizedCookie.match(/BXAuth=([^;]+)/);
  const bxAuth = bxAuthMatch ? bxAuthMatch[1] : "";

  return {
    accessToken: refreshedKey.apiKey,
    apiKey: refreshedKey.apiKey,
    email: refreshedKey.name || keyData.name,
    providerSpecificData: {
      cookie: bxAuth ? `BXAuth=${bxAuth};` : "",
      expireTime: refreshedKey.expireTime,
      authMethod: "cookie",
    },
  };
}

// ─── Save Connection to DB ─────────────────────────────────────────────────────────

export async function saveOAuthConnection(
  provider: string,
  tokens: ExchangeResult,
  authMethod?: string
): Promise<void> {
  const now = new Date();
  const expiresAt = tokens.expiresIn
    ? new Date(now.getTime() + tokens.expiresIn * 1000).toISOString()
    : undefined;

  await createProviderConnection({
    provider,
    authType: "oauth",
    name: tokens.email || `${provider} OAuth`,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt,
    email: tokens.email,
    isActive: true,
    testStatus: "active",
    providerSpecificData: {
      ...Object.fromEntries(Object.entries(tokens).filter(([k]) => !["accessToken", "refreshToken", "expiresIn", "email"].includes(k))),
      authMethod: authMethod || "oauth",
    },
  });
}