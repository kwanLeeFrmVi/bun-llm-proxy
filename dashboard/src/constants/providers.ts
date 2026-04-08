export interface ProviderConfig {
  color: string;
  textIcon: string;
  name: string;
}

export const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  // OAuth providers
  "claude-code": { color: "#CC6B47", textIcon: "CC", name: "Claude Code" },
  "claude": { color: "#D97757", textIcon: "CL", name: "Claude" },
  "github-copilot": { color: "#333333", textIcon: "GH", name: "GitHub Copilot" },
  "cursor": { color: "#00D4AA", textIcon: "CU", name: "Cursor" },
  "codex": { color: "#3B82F6", textIcon: "CX", name: "OpenAI Codex" },
  "kiro": { color: "#FF6B35", textIcon: "KR", name: "Kiro AI" },
  "kilocode": { color: "#FF6B35", textIcon: "KC", name: "Kilo Code" },
  "cline": { color: "#5B9BD5", textIcon: "CL", name: "Cline" },

  // API key providers
  "openai": { color: "#10A37F", textIcon: "OA", name: "OpenAI" },
  "anthropic": { color: "#D97757", textIcon: "AN", name: "Anthropic" },
  "gemini": { color: "#4285F4", textIcon: "GE", name: "Gemini" },
  "deepseek": { color: "#4D6BFE", textIcon: "DS", name: "DeepSeek" },
  "groq": { color: "#F55036", textIcon: "GQ", name: "Groq" },
  "xai": { color: "#1DA1F2", textIcon: "XA", name: "xAI (Grok)" },
  "mistral": { color: "#FF7000", textIcon: "MI", name: "Mistral" },
  "perplexity": { color: "#20808D", textIcon: "PP", name: "Perplexity" },
  "together": { color: "#0F6FFF", textIcon: "TG", name: "Together AI" },
  "fireworks": { color: "#7B2EF2", textIcon: "FW", name: "Fireworks AI" },
  "cerebras": { color: "#FF4F00", textIcon: "CB", name: "Cerebras" },
  "cohere": { color: "#39594D", textIcon: "CO", name: "Cohere" },
  "ollama": { color: "#8b5cf6", textIcon: "OL", name: "Ollama" },
  "nvidia": { color: "#76B900", textIcon: "NV", name: "NVIDIA NIM" },
  "openrouter": { color: "#F97316", textIcon: "OR", name: "OpenRouter" },
  "qwen": { color: "#10B981", textIcon: "QW", name: "Qwen Code" },
  "glm": { color: "#2563EB", textIcon: "GL", name: "GLM Coding" },
  "kimi": { color: "#1E3A8A", textIcon: "KM", name: "Kimi" },
  "minimax": { color: "#7C3AED", textIcon: "MM", name: "Minimax" },
  "nebius": { color: "#6C5CE7", textIcon: "NB", name: "Nebius AI" },
  "siliconflow": { color: "#5B6EF5", textIcon: "SF", name: "SiliconFlow" },
  "hyperbolic": { color: "#00D4FF", textIcon: "HY", name: "Hyperbolic" },

  // Platform providers
  "azure-openai": { color: "#0078D4", textIcon: "AZ", name: "Azure OpenAI" },
  "vertex": { color: "#4285F4", textIcon: "VX", name: "Vertex AI" },
  "bedrock": { color: "#FF9900", textIcon: "BK", name: "AWS Bedrock" },

  // Aliases (case variations from API data)
  "Claude": { color: "#3A8DDE", textIcon: "CL", name: "Claude" },
  "google": { color: "#4285F4", textIcon: "GO", name: "Google" },
};

const DEFAULT_CONFIG: ProviderConfig = {
  color: "#6B7280",
  textIcon: "??",
  name: "Unknown",
};

export function getProviderConfig(providerId: string): ProviderConfig {
  return PROVIDER_CONFIGS[providerId] ?? PROVIDER_CONFIGS[providerId.toLowerCase()] ?? DEFAULT_CONFIG;
}