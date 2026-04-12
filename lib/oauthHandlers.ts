// ─── Server-side OAuth flow handlers ──────────────────────────────────────────
// Handles device code requests, token polling, code exchange, and connection saving.

import {
  OAUTH_CONFIGS,
  generatePKCE,
  type OAuthProviderId,
  type QwenConfig,
  type KiroConfig,
} from "./oauthConfig.ts";
import { createProviderConnection } from "../db/index.ts";
import { asObjectRecord } from "./utils.ts";

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
  if (provider === "qwen") {
    return requestQwenDeviceCode(OAUTH_CONFIGS.qwen);
  }
  if (provider === "kiro") {
    return requestKiroDeviceCode(OAUTH_CONFIGS.kiro, idcConfig);
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

  const data = asObjectRecord(await res.json()) ?? {};
  if (
    typeof data.device_code !== "string" ||
    typeof data.user_code !== "string" ||
    typeof data.verification_uri !== "string" ||
    typeof data.expires_in !== "number"
  ) {
    throw new Error("Qwen device code response is invalid");
  }
  return {
    device_code: data.device_code,
    user_code: data.user_code,
    verification_uri: data.verification_uri,
    verification_uri_complete:
      typeof data.verification_uri_complete === "string"
        ? data.verification_uri_complete
        : undefined,
    expires_in: data.expires_in,
    interval: typeof data.interval === "number" ? data.interval : 5,
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

  const clientInfo = (await registerRes.json()) as { clientId: string; clientSecret: string };

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

  const deviceData = (await deviceRes.json()) as {
    deviceCode: string;
    userCode: string;
    verificationUri: string;
    verificationUriComplete: string;
    expiresIn: number;
    interval?: number;
  };

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
  if (provider === "qwen") {
    return pollQwenToken(OAUTH_CONFIGS.qwen, deviceCode, codeVerifier);
  }
  if (provider === "kiro") {
    return pollKiroToken(OAUTH_CONFIGS.kiro, deviceCode, extraData);
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

  const data = asObjectRecord(await res.json()) ?? {};

  if (res.ok && typeof data.access_token === "string") {
    return {
      success: true,
      tokens: {
        accessToken: data.access_token,
        refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
        expiresIn: typeof data.expires_in === "number" ? data.expires_in : undefined,
        resourceUrl: data.resource_url,
      },
    };
  }

  // Pending/slow_down = keep polling
  if (data.error === "authorization_pending" || data.error === "slow_down") {
    return { success: false, error: data.error };
  }
  return {
    success: false,
    error: typeof data.error === "string" ? data.error : "unknown_error",
    errorDescription:
      typeof data.error_description === "string" ? data.error_description : undefined,
  };
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
    data = asObjectRecord(await res.json()) ?? {};
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
  if (provider === "claude") {
    return buildClaudeAuthorizeUrl(OAUTH_CONFIGS.claude, redirectUri);
  }
  if (provider === "codex") {
    return buildCodexAuthorizeUrl(OAUTH_CONFIGS.codex, redirectUri);
  }
  if (provider === "openai") {
    return buildOpenAIAuthorizeUrl(OAUTH_CONFIGS.openai, redirectUri);
  }
  if (provider === "gemini-cli") {
    return buildGeminiAuthorizeUrl(OAUTH_CONFIGS["gemini-cli"], redirectUri);
  }
  if (provider === "iflow") {
    return buildIflowAuthorizeUrl(OAUTH_CONFIGS.iflow, redirectUri);
  }
  if (provider === "antigravity") {
    return buildAntigravityAuthorizeUrl(OAUTH_CONFIGS.antigravity, redirectUri);
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
  return {
    authUrl: `${config.authorizeUrl}?${params.toString()}`,
    state,
    codeVerifier,
    redirectUri,
  };
}

function buildGeminiAuthorizeUrl(
  config: (typeof OAUTH_CONFIGS)["gemini-cli"],
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
  return {
    authUrl: `${config.authorizeUrl}?${params.toString()}`,
    state,
    codeVerifier: "",
    redirectUri,
  };
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
  return {
    authUrl: `${config.authorizeUrl}?${params.toString()}`,
    state,
    codeVerifier: "",
    redirectUri,
  };
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
  return {
    authUrl: `${config.authorizeUrl}?${params.toString()}`,
    state,
    codeVerifier,
    redirectUri,
  };
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
  return {
    authUrl: `${config.authorizeUrl}?${params.toString()}`,
    state,
    codeVerifier,
    redirectUri,
  };
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
  return {
    authUrl: `${config.authorizeUrl}?${params.toString()}`,
    state,
    codeVerifier: "",
    redirectUri,
  };
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
  if (provider === "claude") {
    return exchangeClaudeCode(OAUTH_CONFIGS.claude, code, redirectUri, codeVerifier, state);
  }
  if (provider === "gemini-cli") {
    return exchangeGeminiCode(OAUTH_CONFIGS["gemini-cli"], code, redirectUri);
  }
  if (provider === "iflow") {
    return exchangeIflowCode(OAUTH_CONFIGS.iflow, code, redirectUri);
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
    authCode = parts[0] ?? "";
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

  const data = asObjectRecord(await res.json()) ?? {};
  if (typeof data.access_token !== "string") {
    throw new Error("Claude token response is invalid");
  }
  return {
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
    expiresIn: typeof data.expires_in === "number" ? data.expires_in : undefined,
    scope: data.scope,
  };
}

async function exchangeGeminiCode(
  config: (typeof OAUTH_CONFIGS)["gemini-cli"],
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

  const data = asObjectRecord(await res.json()) ?? {};
  if (typeof data.access_token !== "string") {
    throw new Error("Gemini token response is invalid");
  }

  // Fetch user info
  let email: string | undefined;
  try {
    const userRes = await fetch(`${config.userInfoUrl}?alt=json`, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    if (userRes.ok) {
      const userInfo = asObjectRecord(await userRes.json()) ?? {};
      email = typeof userInfo.email === "string" ? userInfo.email : undefined;
    }
  } catch {
    /* non-critical */
  }

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
      const projectData = asObjectRecord(await projectRes.json()) ?? {};
      const companionProject = asObjectRecord(projectData.cloudaicompanionProject);
      projectId =
        typeof projectData.cloudaicompanionProject === "string"
          ? projectData.cloudaicompanionProject.trim()
          : typeof companionProject?.id === "string"
            ? companionProject.id.trim()
            : undefined;
    }
  } catch {
    /* non-critical */
  }

  return {
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
    expiresIn: typeof data.expires_in === "number" ? data.expires_in : undefined,
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

  const data = asObjectRecord(await res.json()) ?? {};
  if (typeof data.access_token !== "string") {
    throw new Error("iFlow token response is invalid");
  }

  // Fetch user info (includes API key)
  let email: string | undefined;
  let apiKey: string | undefined;
  try {
    const userRes = await fetch(
      `${config.userInfoUrl}?accessToken=${encodeURIComponent(data.access_token)}`,
      {
        headers: { Accept: "application/json" },
      }
    );
    if (userRes.ok) {
      const result = asObjectRecord(await userRes.json()) ?? {};
      const resultData = asObjectRecord(result.data);
      if (result.success && resultData) {
        email =
          typeof resultData.email === "string"
            ? resultData.email
            : typeof resultData.phone === "string"
              ? resultData.phone
              : undefined;
        apiKey = typeof resultData.apiKey === "string" ? resultData.apiKey : undefined;
      }
    }
  } catch {
    /* non-critical */
  }

  return {
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
    expiresIn: typeof data.expires_in === "number" ? data.expires_in : undefined,
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

  const data = asObjectRecord(await res.json()) ?? {};
  if (typeof data.accessToken !== "string") {
    throw new Error("Kiro social token response is invalid");
  }
  return {
    accessToken: data.accessToken,
    refreshToken: typeof data.refreshToken === "string" ? data.refreshToken : undefined,
    expiresIn: typeof data.expiresIn === "number" ? data.expiresIn : 3600,
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
  const getResult = asObjectRecord(await getRes.json()) ?? {};
  if (!getResult.success) {
    throw new Error(
      `iFlow API key fetch failed: ${typeof getResult.message === "string" ? getResult.message : "unknown error"}`
    );
  }

  const keyData = asObjectRecord(getResult.data);
  if (!keyData || typeof keyData.name !== "string") {
    throw new Error("iFlow API key fetch returned invalid data");
  }

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
  const postResult = asObjectRecord(await postRes.json()) ?? {};
  if (!postResult.success) {
    throw new Error(
      `iFlow API key refresh failed: ${typeof postResult.message === "string" ? postResult.message : "unknown error"}`
    );
  }

  const refreshedKey = asObjectRecord(postResult.data);
  if (!refreshedKey || typeof refreshedKey.apiKey !== "string") {
    throw new Error("iFlow API key refresh returned invalid data");
  }

  // Extract BXAuth
  const bxAuthMatch = normalizedCookie.match(/BXAuth=([^;]+)/);
  const bxAuth = bxAuthMatch ? bxAuthMatch[1] : "";

  return {
    accessToken: refreshedKey.apiKey,
    apiKey: refreshedKey.apiKey,
    email: typeof refreshedKey.name === "string" ? refreshedKey.name : keyData.name,
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
      ...Object.fromEntries(
        Object.entries(tokens).filter(
          ([k]) => !["accessToken", "refreshToken", "expiresIn", "email"].includes(k)
        )
      ),
      authMethod: authMethod || "oauth",
    },
  });
}
