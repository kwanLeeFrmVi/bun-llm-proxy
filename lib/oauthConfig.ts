// ─── OAuth Configuration for Free Providers ─────────────────────────────────────
// Reference: 9router/src/lib/oauth/constants/oauth.js

import { platform, arch } from "node:os";

// ─── PKCE Helpers ────────────────────────────────────────────────────────────────

import { randomBytes, createHash } from "node:crypto";

export function generatePKCE(): { codeVerifier: string; codeChallenge: string; state: string } {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  const state = randomBytes(32).toString("base64url");
  return { codeVerifier, codeChallenge, state };
}

// ─── Platform Enum Helper ─────────────────────────────────────────────────────────

/**
 * Get the platform enum value based on the current OS.
 * Matches Antigravity binary's ClientMetadata.Platform enum.
 */
function getOAuthPlatformEnum() {
  const os = platform();
  const architecture = arch();
  if (os === "darwin") return architecture === "arm64" ? 2 : 1;
  if (os === "linux") return architecture === "arm64" ? 4 : 3;
  if (os === "win32") return 5;
  return 0;
}

/**
 * Get client metadata using numeric enum values for API calls.
 */
export function getOAuthClientMetadata() {
  return { ideType: 9, platform: getOAuthPlatformEnum(), pluginType: 2 };
}

// ─── Config Interfaces ───────────────────────────────────────────────────────────

export interface QwenConfig {
  flowType: "device_code";
  clientId: string;
  deviceCodeUrl: string;
  tokenUrl: string;
  scope: string;
  codeChallengeMethod: string;
}

export interface KiroConfig {
  flowType: "device_code";
  ssoOidcEndpoint: string;
  registerClientUrl: string;
  deviceAuthUrl: string;
  deviceCodeUrl?: string;
  tokenUrl: string;
  startUrl: string;
  clientName: string;
  clientType: string;
  clientId?: string;
  clientSecret?: string;
  scopes: string[];
  grantTypes: string[];
  issuerUrl: string;
  socialAuthEndpoint: string;
  socialLoginUrl: string;
  socialTokenUrl: string;
  socialRefreshUrl: string;
  authMethods: string[];
  scope?: string;
  codeChallengeMethod?: string;
}

export interface GeminiCliConfig {
  flowType: "authorization_code";
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
  codeAssistUrl: string;
}

export interface IflowConfig {
  flowType: "authorization_code";
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  extraParams: { loginMethod: string; type: string };
}

export interface ClaudeConfig {
  flowType: "authorization_code_pkce";
  clientId: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  codeChallengeMethod: string;
}

export interface CodexConfig {
  flowType: "authorization_code_pkce";
  clientId: string;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  codeChallengeMethod: string;
  extraParams: {
    id_token_add_organizations: string;
    codex_cli_simplified_flow: string;
    originator: string;
  };
}

export interface OpenAIConfig {
  flowType: "authorization_code_pkce";
  clientId: string;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  codeChallengeMethod: string;
  extraParams: {
    id_token_add_organizations: string;
    originator: string;
  };
}

export interface AntigravityConfig {
  flowType: "authorization_code";
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
  apiEndpoint: string;
  apiVersion: string;
  loadCodeAssistEndpoint: string;
  onboardUserEndpoint: string;
  loadCodeAssistUserAgent: string;
  loadCodeAssistApiClient: string;
}

export interface GitHubConfig {
  flowType: "device_code";
  clientId: string;
  deviceCodeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string;
  apiVersion: string;
  copilotTokenUrl: string;
  userAgent: string;
  editorVersion: string;
  editorPluginVersion: string;
}

export type OAuthConfig = QwenConfig | KiroConfig | GeminiCliConfig | IflowConfig | ClaudeConfig | CodexConfig | OpenAIConfig | AntigravityConfig | GitHubConfig;

// ─── Provider OAuth Configs ───────────────────────────────────────────────────────

export const OAUTH_CONFIGS: Record<string, OAuthConfig> = {
  // ─── Claude Code — Authorization Code Flow with PKCE ────────────────────────────
  claude: {
    flowType: "authorization_code_pkce",
    clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
    authorizeUrl: "https://claude.ai/oauth/authorize",
    tokenUrl: "https://api.anthropic.com/v1/oauth/token",
    scopes: ["org:create_api_key", "user:profile", "user:inference"],
    codeChallengeMethod: "S256",
  },

  // ─── Codex (OpenAI) — Authorization Code Flow with PKCE ─────────────────────────
  codex: {
    flowType: "authorization_code_pkce",
    clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
    authorizeUrl: "https://auth.openai.com/oauth/authorize",
    tokenUrl: "https://auth.openai.com/oauth/token",
    scope: "openid profile email offline_access",
    codeChallengeMethod: "S256",
    extraParams: {
      id_token_add_organizations: "true",
      codex_cli_simplified_flow: "true",
      originator: "codex_cli_rs",
    },
  },

  // ─── OpenAI — Authorization Code Flow with PKCE ─────────────────────────────────
  openai: {
    flowType: "authorization_code_pkce",
    clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
    authorizeUrl: "https://auth.openai.com/oauth/authorize",
    tokenUrl: "https://auth.openai.com/oauth/token",
    scope: "openid profile email offline_access",
    codeChallengeMethod: "S256",
    extraParams: {
      id_token_add_organizations: "true",
      originator: "openai_native",
    },
  },

  // ─── Gemini CLI — Authorization Code Flow (Google OAuth) ───────────────────────
  "gemini-cli": {
    flowType: "authorization_code",
    clientId: "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com",
    clientSecret: "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",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://www.googleapis.com/oauth2/v1/userinfo",
    scopes: [
      "https://www.googleapis.com/auth/cloud-platform",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ],
    codeAssistUrl: "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist",
  },

  // ─── Antigravity — Authorization Code Flow (Google OAuth) ──────────────────────
  antigravity: {
    flowType: "authorization_code",
    clientId: "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com",
    clientSecret: "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",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://www.googleapis.com/oauth2/v1/userinfo",
    scopes: [
      "https://www.googleapis.com/auth/cloud-platform",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/cclog",
      "https://www.googleapis.com/auth/experimentsandconfigs",
    ],
    apiEndpoint: "https://cloudcode-pa.googleapis.com",
    apiVersion: "v1internal",
    loadCodeAssistEndpoint: "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist",
    onboardUserEndpoint: "https://cloudcode-pa.googleapis.com/v1internal:onboardUser",
    loadCodeAssistUserAgent: "google-api-nodejs-client/9.15.1",
    loadCodeAssistApiClient: "google-cloud-sdk vscode_cloudshelleditor/0.1",
  },

  // ─── Qwen Code — Device Code Flow with PKCE ──────────────────────────────────
  qwen: {
    flowType: "device_code",
    clientId: "f0304373b74a44d2b584a3fb70ca9e56",
    deviceCodeUrl: "https://chat.qwen.ai/api/v1/oauth2/device/code",
    tokenUrl: "https://chat.qwen.ai/api/v1/oauth2/token",
    scope: "openid profile email model.completion",
    codeChallengeMethod: "S256",
  },

  // ─── Kiro AI — AWS SSO Device Code + Social Login ──────────────────────────────
  kiro: {
    flowType: "device_code",
    ssoOidcEndpoint: "https://oidc.us-east-1.amazonaws.com",
    registerClientUrl: "https://oidc.us-east-1.amazonaws.com/client/register",
    deviceAuthUrl: "https://oidc.us-east-1.amazonaws.com/device_authorization",
    tokenUrl: "https://oidc.us-east-1.amazonaws.com/token",
    startUrl: "https://view.awsapps.com/start",
    clientName: "kiro-oauth-client",
    clientType: "public",
    scopes: ["codewhisperer:completions", "codewhisperer:analysis", "codewhisperer:conversations"],
    grantTypes: ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token"],
    issuerUrl: "https://identitycenter.amazonaws.com/ssoins-722374e8c3c8e6c6",
    socialAuthEndpoint: "https://prod.us-east-1.auth.desktop.kiro.dev",
    socialLoginUrl: "https://prod.us-east-1.auth.desktop.kiro.dev/login",
    socialTokenUrl: "https://prod.us-east-1.auth.desktop.kiro.dev/oauth/token",
    socialRefreshUrl: "https://prod.us-east-1.auth.desktop.kiro.dev/refreshToken",
    authMethods: ["builder-id", "idc", "google", "github", "import"],
  },

  // ─── iFlow AI — Authorization Code Flow (Basic Auth) ───────────────────────────
  iflow: {
    flowType: "authorization_code",
    clientId: "10009311001",
    clientSecret: "4Z3YjXycVsQvyGF1etiNlIBB4RsqSDtW",
    authorizeUrl: "https://iflow.cn/oauth",
    tokenUrl: "https://iflow.cn/oauth/token",
    userInfoUrl: "https://iflow.cn/api/oauth/getUserInfo",
    extraParams: {
      loginMethod: "phone",
      type: "phone",
    },
  },

  // ─── GitHub Copilot — Device Code Flow ─────────────────────────────────────────
  github: {
    flowType: "device_code",
    clientId: "Iv1.b507a08c87ecfe98",
    deviceCodeUrl: "https://github.com/login/device/code",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userInfoUrl: "https://api.github.com/user",
    scopes: "read:user",
    apiVersion: "2022-11-28",
    copilotTokenUrl: "https://api.github.com/copilot_internal/v2/token",
    userAgent: "GitHubCopilotChat/0.26.7",
    editorVersion: "vscode/1.85.0",
    editorPluginVersion: "copilot-chat/0.26.7",
  },
};

export type OAuthProviderId = "claude" | "codex" | "openai" | "gemini-cli" | "antigravity" | "qwen" | "kiro" | "iflow" | "github";

export function isOAuthProviderId(id: string): id is OAuthProviderId {
  return id in OAUTH_CONFIGS;
}

// ─── OAuth timeout (5 minutes) ─────────────────────────────────────────────────────
export const OAUTH_TIMEOUT = 300000;

// ─── Provider list for reference ───────────────────────────────────────────────────
export const PROVIDERS = {
  CLAUDE: "claude",
  CODEX: "codex",
  OPENAI: "openai",
  GEMINI: "gemini-cli",
  ANTIGRAVITY: "antigravity",
  QWEN: "qwen",
  KIRO: "kiro",
  IFLOW: "iflow",
  GITHUB: "github",
};
