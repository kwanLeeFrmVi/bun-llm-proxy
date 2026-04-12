// Provider-level helpers: format detection, URL building, header building.
// Refactored to use constants-based configuration for better maintainability.

import { FORMATS } from "../translator/formats.ts";
import {
  CLAUDE_API_HEADERS,
  OPENAI_DEFAULT_BASE_URL,
  ANTHROPIC_DEFAULT_BASE_URL,
  X_API_KEY_PROVIDERS,
  ACCESS_TOKEN_ONLY_PROVIDERS,
  OPENAI_COMPATIBLE_PREFIX,
  ANTHROPIC_COMPATIBLE_PREFIX,
} from "../../lib/constants.ts";
import { getCachedClaudeHeaders } from "../utils/claudeHeaderCache.ts";

/** Quick check if a string looks like a Vertex AI Service Account JSON key */
function isVertexSaJson(apiKey: string): boolean {
  return apiKey.startsWith('{"') && apiKey.includes('"service_account"');
}

// ─── Provider Configuration ───────────────────────────────────────────────────────

interface ProviderConfig {
  baseUrl?: string;
  format: string;
  headers?: Record<string, string>;
  baseUrls?: string[];  // For providers with multiple fallback URLs (e.g., antigravity)
  usesApiKeyInUrl?: boolean;  // For Gemini where API key goes in URL
}

export const PROVIDERS: Record<string, ProviderConfig> = {
  // ── OAuth / Special providers ────────────────────────────────────────────────────
  claude: {
    baseUrl: "https://api.anthropic.com/v1/messages",
    format: FORMATS.CLAUDE,
    headers: CLAUDE_API_HEADERS,
  },
  codex: {
    baseUrl: "https://api.openai.com/v1/chat/completions",
    format: FORMATS.OPENAI,
  },
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    format: FORMATS.GEMINI,
    usesApiKeyInUrl: true,
  },
  "gemini-cli": {
    baseUrl: "https://cloudcode-pa.googleapis.com/v1internal",
    format: FORMATS.GEMINI_CLI,
  },
  antigravity: {
    baseUrls: [
      "https://daily-cloudcode-pa.googleapis.com",
      "https://daily-cloudcode-pa.sandbox.googleapis.com",
    ],
    format: FORMATS.ANTIGRAVITY,
  },
  kiro: {
    baseUrl: "https://codewhisperer.us-east-1.amazonaws.com/generateAssistantResponse",
    format: FORMATS.KIRO,
  },
  cursor: {
    baseUrl: "https://api2.cursor.sh",
    format: FORMATS.CURSOR,
  },
  vertex: {
    baseUrl: "https://aiplatform.googleapis.com",
    format: FORMATS.VERTEX,
  },
  "vertex-partner": {
    baseUrl: "https://aiplatform.googleapis.com",
    format: FORMATS.OPENAI,  // Uses OpenAI-compatible endpoint, not Gemini format
  },

  // ── API Key providers ─────────────────────────────────────────────────────────────
  openai: {
    baseUrl: "https://api.openai.com/v1/chat/completions",
    format: FORMATS.OPENAI,
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    format: FORMATS.OPENAI,
  },
  anthropic: {
    baseUrl: "https://api.anthropic.com/v1/messages",
    format: FORMATS.CLAUDE,
    headers: CLAUDE_API_HEADERS,
  },
  nvidia: {
    baseUrl: "https://integrate.api.nvidia.com/v1/chat/completions",
    format: FORMATS.OPENAI,
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com/chat/completions",
    format: FORMATS.OPENAI,
  },
  groq: {
    baseUrl: "https://api.groq.com/openai/v1/chat/completions",
    format: FORMATS.OPENAI,
  },
  xai: {
    baseUrl: "https://api.x.ai/v1/chat/completions",
    format: FORMATS.OPENAI,
  },
  mistral: {
    baseUrl: "https://api.mistral.ai/v1/chat/completions",
    format: FORMATS.OPENAI,
  },
  perplexity: {
    baseUrl: "https://api.perplexity.ai/chat/completions",
    format: FORMATS.OPENAI,
  },
  together: {
    baseUrl: "https://api.together.xyz/v1/chat/completions",
    format: FORMATS.OPENAI,
  },
  fireworks: {
    baseUrl: "https://api.fireworks.ai/inference/v1/chat/completions",
    format: FORMATS.OPENAI,
  },
  cerebras: {
    baseUrl: "https://api.cerebras.ai/v1/chat/completions",
    format: FORMATS.OPENAI,
  },
  cohere: {
    baseUrl: "https://api.cohere.ai/v1/chat/completions",
    format: FORMATS.OPENAI,
  },
  nebius: {
    baseUrl: "https://api.studio.nebius.ai/v1/chat/completions",
    format: FORMATS.OPENAI,
  },
  siliconflow: {
    baseUrl: "https://api.siliconflow.cn/v1/chat/completions",
    format: FORMATS.OPENAI,
  },
  hyperbolic: {
    baseUrl: "https://api.hyperbolic.xyz/v1/chat/completions",
    format: FORMATS.OPENAI,
  },
  ollama: {
    baseUrl: "https://ollama.com/api/chat",
    format: FORMATS.OLLAMA,
  },
  glm: {
    baseUrl: "https://api.z.ai/api/anthropic/v1/messages",
    format: FORMATS.CLAUDE,
    headers: CLAUDE_API_HEADERS,
  },
  "glm-cn": {
    baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions",
    format: FORMATS.OPENAI,
  },
  kimi: {
    baseUrl: "https://api.kimi.com/coding/v1/messages",
    format: FORMATS.CLAUDE,
    headers: CLAUDE_API_HEADERS,
  },
  "kimi-coding": {
    baseUrl: "https://api.kimi.com/coding/v1/messages",
    format: FORMATS.CLAUDE,
    headers: CLAUDE_API_HEADERS,
  },
  kilocode: {
    baseUrl: "https://api.kilo.ai/api/openrouter/chat/completions",
    format: FORMATS.OPENAI,
  },
  minimax: {
    baseUrl: "https://api.minimax.io/anthropic/v1/messages",
    format: FORMATS.CLAUDE,
    headers: CLAUDE_API_HEADERS,
  },
  "minimax-cn": {
    baseUrl: "https://api.minimaxi.com/anthropic/v1/messages",
    format: FORMATS.CLAUDE,
    headers: CLAUDE_API_HEADERS,
  },
  alicode: {
    baseUrl: "https://coding.dashscope.aliyuncs.com/v1/chat/completions",
    format: FORMATS.OPENAI,
  },
  "alicode-intl": {
    baseUrl: "https://coding-intl.dashscope.aliyuncs.com/v1/chat/completions",
    format: FORMATS.OPENAI,
  },
  deepgram: {
    baseUrl: "https://api.deepgram.com/v1/listen",
    format: FORMATS.OPENAI,
  },
  assemblyai: {
    baseUrl: "https://api.assemblyai.com/v1/audio/transcriptions",
    format: FORMATS.OPENAI,
  },
  nanobanana: {
    baseUrl: "https://api.nanobananaapi.ai/v1/chat/completions",
    format: FORMATS.OPENAI,
  },
  chutes: {
    baseUrl: "https://llm.chutes.ai/v1/chat/completions",
    format: FORMATS.OPENAI,
  },
};

// ─── Format Detection ─────────────────────────────────────────────────────────────

/**
 * Detect source format from request body structure.
 * This is a simplified version of open-sse's detectFormat.
 */
export function detectFormat(body: Record<string, unknown> | null): string {
  if (!body) return FORMATS.OPENAI;

  // OpenAI Responses API: has input (array or string) instead of messages[]
  if (body.input !== undefined && Array.isArray(body.input)) {
    return FORMATS.OPENAI_RESPONSES;
  }

  // Gemini format: has contents array
  if (body.contents && Array.isArray(body.contents)) {
    return FORMATS.GEMINI;
  }

  // OpenAI-specific fields
  if (
    body.stream_options !== undefined ||
    body.response_format !== undefined ||
    body.logprobs !== undefined ||
    body.n !== undefined
  ) {
    return FORMATS.OPENAI;
  }

  // Claude format: has messages with content as array
  if (body.messages && Array.isArray(body.messages)) {
    const firstMsg = body.messages[0] as Record<string, unknown> | undefined;
    if (firstMsg?.content && Array.isArray(firstMsg.content)) {
      const firstContent = (firstMsg.content as Array<Record<string, unknown>>)[0];
      // Claude uses source.type, OpenAI uses image_url.url
      if (firstContent?.type === "text" && !body.model?.toString().includes("/")) {
        if (body.system !== undefined || body.anthropic_version !== undefined) {
          return FORMATS.CLAUDE;
        }
      }
      // Check for Claude image format
      const hasClaudeImage = (firstMsg.content as Array<Record<string, unknown>>).some(
        (c) => {
          const content = c as Record<string, unknown>;
          const source = content.source as Record<string, unknown> | undefined;
          return content.type === "image" && source?.type === "base64";
        }
      );
      if (hasClaudeImage) return FORMATS.CLAUDE;
      // Check for Claude tool format
      const hasClaudeTool = (firstMsg.content as Array<Record<string, unknown>>).some(
        (c) => {
          const content = c as Record<string, unknown>;
          return content.type === "tool_use" || content.type === "tool_result";
        }
      );
      if (hasClaudeTool) return FORMATS.CLAUDE;
    }
    if (body.system !== undefined || body.anthropic_version !== undefined) {
      return FORMATS.CLAUDE;
    }
  }

  return FORMATS.OPENAI;
}

/**
 * Get target format for a provider.
 */
export function getTargetFormat(provider: string): string {
  const config = PROVIDERS[provider];
  if (config) return config.format;

  // Handle compatible providers
  if (provider.startsWith(ANTHROPIC_COMPATIBLE_PREFIX)) return FORMATS.CLAUDE;
  return FORMATS.OPENAI;
}

/**
 * Build upstream URL for a provider.
 */
export function buildUpstreamUrl(
  provider: string,
  model: string,
  stream: boolean,
  credentials: Record<string, unknown>
): string | null {
  const psd = credentials.providerSpecificData as Record<string, unknown> | undefined;

  // Handle openai-compatible-* dynamically
  if (provider.startsWith(OPENAI_COMPATIBLE_PREFIX)) {
    const base = (psd?.baseUrl as string | undefined) ?? OPENAI_DEFAULT_BASE_URL.replace("/v1", "");
    const cleanBase = base.replace(/\/v1\/?$/, "");
    return `${cleanBase}/v1/chat/completions`;
  }

  // Handle anthropic-compatible-* dynamically
  if (provider.startsWith(ANTHROPIC_COMPATIBLE_PREFIX)) {
    const base = (psd?.baseUrl as string | undefined) ?? ANTHROPIC_DEFAULT_BASE_URL.replace("/v1", "");
    const cleanBase = base.replace(/\/v1\/?$/, "");
    return `${cleanBase}/v1/messages`;
  }

  // Handle vertex-partner: OpenAI-compatible endpoint
  if (provider === "vertex-partner") {
    const projectId = credentials.projectId as string | undefined;
    if (!projectId) return null;
    const url = `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/global/endpoints/openapi/chat/completions`;
    // Raw API key (non-SA JSON) goes in URL ?key= param
    const apiKey = credentials.apiKey as string | undefined;
    if (apiKey && !isVertexSaJson(apiKey)) {
      return `${url}?key=${apiKey}`;
    }
    return url;
  }

  // Handle ollama-local special case
  if (provider === "ollama-local") {
    const base = (psd?.baseUrl as string | undefined) ?? "http://localhost:11434";
    return `${base.replace(/\/$/, "")}/api/chat`;
  }

  const config = PROVIDERS[provider];
  if (!config) {
    // Fallback for unknown providers
    return `${OPENAI_DEFAULT_BASE_URL}/chat/completions`;
  }

  // Handle Gemini API key in URL
  if (config.usesApiKeyInUrl) {
    const apiKey = credentials.apiKey as string | undefined;
    if (!apiKey) return null;
    const action = stream ? "streamGenerateContent" : "generateContent";
    return `${config.baseUrl}/${model}:${action}?key=${apiKey}`;
  }

  // Handle antigravity with multiple baseUrls
  if (config.baseUrls) {
    const action = stream ? "streamGenerateContent" : "generateContent";
    return `${config.baseUrls[0]}/v1beta/models/${model}:${action}`;
  }

  // Handle streaming for Gemini formats
  if (config.format === FORMATS.GEMINI || config.format === FORMATS.GEMINI_CLI || config.format === FORMATS.VERTEX) {
    const action = stream ? "streamGenerateContent" : "generateContent";

    // Vertex AI requires full path: /v1/projects/{project}/locations/{location}/publishers/{publisher}/models/{model}
    if (config.format === FORMATS.VERTEX) {
      const projectId = credentials.projectId as string | undefined;
      const region = (psd?.region as string) ?? "global";
      if (projectId) {
        // Model format: "publisher/model" (e.g., "zai-org/glm-5-maas") or plain model name
        const slashIdx = model.indexOf("/");
        const publisher = slashIdx >= 0 ? model.slice(0, slashIdx) : model;
        const modelName = slashIdx >= 0 ? model.slice(slashIdx + 1) : model;
        return `${config.baseUrl}/v1/projects/${projectId}/locations/${region}/publishers/${publisher}/models/${modelName}:${action}`;
      }
    }

    return `${config.baseUrl ?? ""}/${model}:${action}`;
  }

  return config.baseUrl ?? null;
}

/**
 * Build upstream headers for a provider.
 */
export function buildUpstreamHeaders(
  provider: string,
  credentials: Record<string, unknown>
): Record<string, string> {
  const apiKey = credentials.apiKey as string | undefined;
  const accessToken = credentials.accessToken as string | undefined;
  const providerSpecificData = credentials.providerSpecificData as Record<string, unknown> | undefined;

  // Handle anthropic-compatible-* dynamically
  if (provider.startsWith(ANTHROPIC_COMPATIBLE_PREFIX)) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...CLAUDE_API_HEADERS,
    };

    // Overlay cached Claude headers if available
    const cached = getCachedClaudeHeaders();
    if (cached) {
      overlayCachedHeaders(headers, cached);
    }

    if (apiKey) {
      headers["x-api-key"] = apiKey;
    } else if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    // Strip first-party Claude Code identity headers for non-Anthropic upstreams
    const baseUrl = (providerSpecificData?.baseUrl as string | undefined) ?? "";
    const isOfficialAnthropic = baseUrl === "" || baseUrl.includes("api.anthropic.com");
    if (!isOfficialAnthropic) {
      stripClaudeCodeHeaders(headers);
    }

    return headers;
  }

  const config = PROVIDERS[provider];
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...config?.headers,
  };

  // Special handling for claude and anthropic providers
  if (provider === "claude" || provider === "anthropic") {
    const cached = getCachedClaudeHeaders();
    if (cached) {
      overlayCachedHeaders(headers, cached);
    }
  }

  // Gemini uses API key in URL, not header
  if (config?.usesApiKeyInUrl) {
    return headers;
  }

  // Build authorization header based on provider type
  if (X_API_KEY_PROVIDERS.has(provider)) {
    if (apiKey) {
      headers["x-api-key"] = apiKey;
    } else if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }
  } else if (ACCESS_TOKEN_ONLY_PROVIDERS.has(provider)) {
    headers["Authorization"] = `Bearer ${accessToken ?? ""}`;
  } else if (provider === "vertex" || provider === "vertex-partner") {
    // Vertex providers use OAuth token from accessToken (minted from service account JSON)
    // Prefer accessToken over apiKey since apiKey contains the raw service account JSON
    headers["Authorization"] = `Bearer ${accessToken ?? ""}`;
  } else {
    // Default: Bearer token with API key or access token
    headers["Authorization"] = `Bearer ${apiKey ?? accessToken ?? ""}`;
  }

  return headers;
}

/**
 * Helper function to overlay cached Claude headers onto base headers.
 * Handles Title-Case to lowercase conversion and merges anthropic-beta flags.
 */
function overlayCachedHeaders(
  baseHeaders: Record<string, string>,
  cached: Record<string, string>
): void {
  for (const lcKey of Object.keys(cached)) {
    // Build the Title-Case equivalent: "anthropic-version" → "Anthropic-Version"
    const titleKey = lcKey.replace(/(^|-)([a-z])/g, (_, sep, c) => sep + c.toUpperCase());

    // Special handling for anthropic-beta to preserve required flags
    if (lcKey === "anthropic-beta") {
      const staticBetaStr = baseHeaders[titleKey] || baseHeaders[lcKey] || "";
      const staticFlags = new Set(staticBetaStr.split(",").map((f) => f.trim()).filter(Boolean));
      const cachedFlags = new Set((cached[lcKey] || "").split(",").map((f) => f.trim()).filter(Boolean));

      // Merge all static flags into the cached ones
      for (const flag of staticFlags) {
        cachedFlags.add(flag);
      }

      cached[lcKey] = Array.from(cachedFlags).join(",");
    }

    // Remove Title-Case variant if it exists
    if (titleKey !== lcKey && baseHeaders[titleKey] !== undefined) {
      delete baseHeaders[titleKey];
    }
  }

  // Overlay cached headers
  Object.assign(baseHeaders, cached);
}

/**
 * Helper function to strip Claude Code identity headers for non-Anthropic upstreams.
 * Removes headers that identify the request as coming from Claude Code client.
 */
function stripClaudeCodeHeaders(headers: Record<string, string>): void {
  const headersToDelete = [
    "anthropic-dangerous-direct-browser-access",
    "Anthropic-Dangerous-Direct-Browser-Access",
    "x-app",
    "X-App",
  ];

  for (const key of headersToDelete) {
    delete headers[key];
  }

  // Strip claude-code-20250219 from anthropic-beta
  for (const betaKey of ["anthropic-beta", "Anthropic-Beta"]) {
    if (headers[betaKey]) {
      const filtered = headers[betaKey]
        .split(",")
        .map((s) => s.trim())
        .filter((f) => f && f !== "claude-code-20250219")
        .join(",");

      if (filtered) {
        headers[betaKey] = filtered;
      } else {
        delete headers[betaKey];
      }
    }
  }
}
