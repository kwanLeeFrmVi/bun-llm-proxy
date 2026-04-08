// ─── Provider metadata (single source of truth) ──────────────────────────────────

export interface ProviderMeta {
  color: string;
  textIcon: string;
  name: string;
  website?: string;
  notice?: { text: string; apiKeyUrl?: string };
  deprecated?: boolean;
  deprecationNotice?: string;
}

// ─── Free Providers ────────────────────────────────────────────────────────────

export const FREE_PROVIDERS: Record<string, ProviderMeta> = {
  kiro: {
    color: "#FF6B35", textIcon: "KR", name: "Kiro AI",
    website: "https://kiro.dev",
    notice: { text: "Free tier: unlimited requests. May require referral for full access.", apiKeyUrl: "https://kiro.dev" },
  },
  qwen: {
    color: "#10B981", textIcon: "QW", name: "Qwen Code",
    website: "https://qwenlm.ai",
    notice: { text: "Free tier: Qwen models available.", apiKeyUrl: "https://qwenlm.ai" },
  },
  "gemini-cli": {
    color: "#4285F4", textIcon: "GC", name: "Gemini CLI",
    website: "https://ai.google.dev",
    deprecated: true,
    deprecationNotice: "Google has tightened Gemini CLI abuse detection. Using this provider may violate ToS and risk account bans.",
  },
  iflow: {
    color: "#6366F1", textIcon: "IF", name: "iFlow AI",
    website: "https://iflowbot.com",
    notice: { text: "Free tier available.", apiKeyUrl: "https://iflowbot.com" },
  },
  claude: {
    color: "#D97757", textIcon: "CC", name: "Claude Code",
    website: "https://claude.ai",
    notice: { text: "Connect via OAuth for free access to Claude models.", apiKeyUrl: "https://claude.ai" },
  },
};

// ─── Free Tier Providers ────────────────────────────────────────────────────────

export const FREE_TIER_PROVIDERS: Record<string, ProviderMeta> = {
  openrouter: {
    color: "#F97316", textIcon: "OR", name: "OpenRouter",
    website: "https://openrouter.ai",
    notice: { text: "Free tier: 27+ free models, no credit card needed, 200 req/day. After $10 credit: 1,000 req/day.", apiKeyUrl: "https://openrouter.ai/settings/keys" },
  },
  nvidia: {
    color: "#76B900", textIcon: "NV", name: "NVIDIA NIM",
    website: "https://developer.nvidia.com/nim",
    notice: { text: "Free access for NVIDIA Developer Program members (prototyping & testing).", apiKeyUrl: "https://build.nvidia.com/settings/api-keys" },
  },
  ollama: {
    color: "#8b5cf6", textIcon: "OL", name: "Ollama Cloud",
    website: "https://ollama.com",
    notice: { text: "Free tier: light usage, 1 cloud model at a time (limits reset every 5h & 7d). Pro $20/mo.", apiKeyUrl: "https://ollama.com/settings/keys" },
  },
  vertex: {
    color: "#4285F4", textIcon: "VX", name: "Vertex AI",
    website: "https://cloud.google.com/vertex-ai",
    notice: { text: "New Google Cloud accounts get $300 free credits. Requires GCP project + Service Account.", apiKeyUrl: "https://console.cloud.google.com/iam-admin/serviceaccounts" },
  },
};

// ─── API Key Providers ─────────────────────────────────────────────────────────

export const APIKEY_PROVIDERS: Record<string, ProviderMeta> = {
  glm:      { color: "#2563EB", textIcon: "GL", name: "GLM Coding",         website: "https://open.bigmodel.cn" },
  "glm-cn": { color: "#DC2626", textIcon: "GC", name: "GLM (China)",        website: "https://open.bigmodel.cn" },
  kimi:     { color: "#1E3A8A", textIcon: "KM", name: "Kimi",               website: "https://kimi.moonshot.cn" },
  minimax:     { color: "#7C3AED", textIcon: "MM", name: "MiniMax",           website: "https://www.minimaxi.com" },
  "minimax-cn": { color: "#DC2626", textIcon: "MM", name: "MiniMax (China)",   website: "https://www.minimaxi.com" },
  alicode:  { color: "#FF6A00", textIcon: "ALi", name: "Alibaba",            website: "https://www.alibabacloud.com" },
  "alicode-intl": { color: "#FF6A00", textIcon: "ALi", name: "Alibaba Intl",  website: "https://www.alibabacloud.com" },
  openai:   { color: "#10A37F", textIcon: "OA", name: "OpenAI",               website: "https://platform.openai.com" },
  anthropic:{ color: "#D97757", textIcon: "AN", name: "Anthropic",            website: "https://console.anthropic.com" },
  gemini:   { color: "#4285F4", textIcon: "GE", name: "Gemini",              website: "https://ai.google.dev" },
  deepseek: { color: "#4D6BFE", textIcon: "DS", name: "DeepSeek",         website: "https://deepseek.com" },
  "deepseek-cn": { color: "#DC2626", textIcon: "DS", name: "DeepSeek (China)", website: "https://deepseek.com" },
  groq:     { color: "#F55036", textIcon: "GQ", name: "Groq",                website: "https://groq.com" },
  xai:      { color: "#1DA1F2", textIcon: "XA", name: "xAI (Grok)",         website: "https://x.ai" },
  mistral:  { color: "#FF7000", textIcon: "MI", name: "Mistral",             website: "https://mistral.ai" },
  perplexity:{ color: "#20808D", textIcon: "PP", name: "Perplexity",          website: "https://www.perplexity.ai" },
  together: { color: "#0F6FFF", textIcon: "TG", name: "Together AI",          website: "https://www.together.ai" },
  fireworks:{ color: "#7B2EF2", textIcon: "FW", name: "Fireworks AI",         website: "https://fireworks.ai" },
  cerebras: { color: "#FF4F00", textIcon: "CB", name: "Cerebras",            website: "https://www.cerebras.ai" },
  cohere:   { color: "#39594D", textIcon: "CO", name: "Cohere",              website: "https://cohere.com" },
  nebius:   { color: "#6C5CE7", textIcon: "NB", name: "Nebius AI",           website: "https://nebius.com" },
  siliconflow:{ color: "#5B6EF5", textIcon: "SF", name: "SiliconFlow",       website: "https://cloud.siliconflow.com" },
  hyperbolic:{ color: "#00D4FF", textIcon: "HY", name: "Hyperbolic",          website: "https://hyperbolic.xyz" },
  deepgram: { color: "#13EF93", textIcon: "DG", name: "Deepgram",            website: "https://deepgram.com" },
  assemblyai:{ color: "#0062FF", textIcon: "AA", name: "AssemblyAI",         website: "https://assemblyai.com" },
  nanobanana:{ color: "#FFD700", textIcon: "NB", name: "NanoBanana",         website: "https://nanobananaapi.ai" },
  chutes:   { color: "#6366F1", textIcon: "CH", name: "Chutes AI",           website: "https://chutes.ai" },
  "ollama-local": { color: "#8b5cf6", textIcon: "OL", name: "Ollama Local",  website: "https://ollama.com" },
  "vertex-partner": { color: "#34A853", textIcon: "VP", name: "Vertex Partner", website: "https://cloud.google.com/vertex-ai/generative-ai/docs/partner-models/use-partner-models" },
};

// ─── Compatible provider prefix constants ──────────────────────────────────────

export const OPENAI_COMPATIBLE_PREFIX    = "openai-compatible-";
export const ANTHROPIC_COMPATIBLE_PREFIX = "anthropic-compatible-";

export function isOpenAICompatibleProvider(providerId: string): boolean {
  return typeof providerId === "string" && providerId.startsWith(OPENAI_COMPATIBLE_PREFIX);
}

export function isAnthropicCompatibleProvider(providerId: string): boolean {
  return typeof providerId === "string" && providerId.startsWith(ANTHROPIC_COMPATIBLE_PREFIX);
}

// ─── All providers merged ──────────────────────────────────────────────────────

export const ALL_PROVIDERS: Record<string, ProviderMeta> = {
  ...FREE_PROVIDERS,
  ...FREE_TIER_PROVIDERS,
  ...APIKEY_PROVIDERS,
};

// ─── Backward-compat alias ─────────────────────────────────────────────────────

/** @deprecated Use ALL_PROVIDERS / FREE_PROVIDERS / FREE_TIER_PROVIDERS / APIKEY_PROVIDERS directly. */
export const PROVIDER_CONFIGS: Record<string, ProviderMeta> = ALL_PROVIDERS;

export function getProviderConfig(providerId: string): ProviderMeta {
  return ALL_PROVIDERS[providerId] ?? ALL_PROVIDERS[providerId.toLowerCase()] ?? {
    color: "#6B7280",
    textIcon: "??",
    name: "Unknown",
  };
}

// ─── Auth type helpers ─────────────────────────────────────────────────────────

export function isOAuthProvider(providerId: string): boolean {
  return providerId in FREE_PROVIDERS;
}

// ─── Provider ID to Alias mapping ──────────────────────────────────────────────
// Maps provider IDs to their model alias prefix (e.g., "nvidia" → "nvidia/glm-5")

export const PROVIDER_ID_TO_ALIAS: Record<string, string> = {
  // OAuth providers (short aliases)
  claude: "cc",
  codex: "cx",
  "gemini-cli": "gc",
  qwen: "qw",
  iflow: "if",
  antigravity: "ag",
  github: "gh",
  kiro: "kr",
  cursor: "cu",
  "kimi-coding": "kmc",
  kilocode: "kc",
  cline: "cl",
  vertex: "vertex",
  "vertex-partner": "vertex-partner",
  // API Key providers (alias = provider id)
  openai: "openai",
  anthropic: "anthropic",
  gemini: "gemini",
  deepseek: "deepseek",
  "deepseek-cn": "deepseek-cn",
  groq: "groq",
  xai: "xai",
  mistral: "mistral",
  perplexity: "perplexity",
  together: "together",
  fireworks: "fireworks",
  cerebras: "cerebras",
  cohere: "cohere",
  nebius: "nebius",
  siliconflow: "siliconflow",
  hyperbolic: "hyperbolic",
  deepgram: "deepgram",
  assemblyai: "assemblyai",
  nanobanana: "nanobanana",
  chutes: "chutes",
  glm: "glm",
  "glm-cn": "glm-cn",
  kimi: "kimi",
  minimax: "minimax",
  "minimax-cn": "minimax-cn",
  alicode: "alicode",
  "alicode-intl": "alicode-intl",
  openrouter: "openrouter",
  nvidia: "nvidia",
  ollama: "ollama",
  "ollama-local": "ollama-local",
};

export function getProviderAlias(providerId: string): string {
  return PROVIDER_ID_TO_ALIAS[providerId] ?? providerId;
}
