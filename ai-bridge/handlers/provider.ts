// Provider-level helpers: format detection, URL building, header building.
// Refactored to use constants-based configuration for better maintainability.

import { FORMATS } from "../translator/formats.ts";

// ─── Provider Configuration ───────────────────────────────────────────────────────

interface ProviderConfig {
  baseUrl?: string;
  format: string;
  headers?: Record<string, string>;
  baseUrls?: string[];  // For providers with multiple fallback URLs (e.g., antigravity)
  usesApiKeyInUrl?: boolean;  // For Gemini where API key goes in URL
}

const CLAUDE_API_HEADERS = {
  "Anthropic-Version": "2023-06-01",
};

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

// Providers that use x-api-key header instead of Authorization Bearer
const X_API_KEY_PROVIDERS = new Set([
  "claude",
  "anthropic",
  "glm",
  "kimi",
  "kimi-coding",
  "minimax",
  "minimax-cn",
]);

// Providers that only use accessToken (no API key support)
const ACCESS_TOKEN_ONLY_PROVIDERS = new Set([
  "gemini-cli",
  "antigravity",
  "kiro",
]);

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
  if (provider.startsWith("anthropic-compatible-")) return FORMATS.CLAUDE;
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
  if (provider.startsWith("openai-compatible-")) {
    const base = (psd?.baseUrl as string | undefined) ?? "https://api.openai.com";
    const cleanBase = base.replace(/\/v1\/?$/, "");
    return `${cleanBase}/v1/chat/completions`;
  }

  // Handle anthropic-compatible-* dynamically
  if (provider.startsWith("anthropic-compatible-")) {
    const base = (psd?.baseUrl as string | undefined) ?? "https://api.anthropic.com";
    const cleanBase = base.replace(/\/v1\/?$/, "");
    return `${cleanBase}/v1/messages`;
  }

  // Handle ollama-local special case
  if (provider === "ollama-local") {
    const base = (psd?.baseUrl as string | undefined) ?? "http://localhost:11434";
    return `${base.replace(/\/$/, "")}/api/chat`;
  }

  const config = PROVIDERS[provider];
  if (!config) {
    // Fallback for unknown providers
    return "https://api.openai.com/v1/chat/completions";
  }

  // Handle Gemini API key in URL
  if (config.usesApiKeyInUrl) {
    const apiKey = credentials.apiKey as string | undefined;
    if (!apiKey) return null;
    const action = stream ? "streamGenerateContent?alt=sse" : "generateContent";
    return `${config.baseUrl}/${model}:${action}&key=${apiKey}`;
  }

  // Handle antigravity with multiple baseUrls
  if (config.baseUrls) {
    const action = stream ? "streamGenerateContent?alt=sse" : "generateContent";
    return `${config.baseUrls[0]}/v1beta/models/${model}:${action}`;
  }

  // Handle streaming for Gemini formats
  if (config.format === FORMATS.GEMINI || config.format === FORMATS.GEMINI_CLI) {
    const action = stream ? "streamGenerateContent?alt=sse" : "generateContent";
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

  // Handle anthropic-compatible-* dynamically
  if (provider.startsWith("anthropic-compatible-")) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...CLAUDE_API_HEADERS,
    };
    if (apiKey) {
      headers["x-api-key"] = apiKey;
    } else if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }
    return headers;
  }

  const config = PROVIDERS[provider];
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...config?.headers,
  };

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
  } else {
    // Default: Bearer token with API key or access token
    headers["Authorization"] = `Bearer ${apiKey ?? accessToken ?? ""}`;
  }

  return headers;
}
