import {
  getProviderConnectionById,
  updateProviderConnection,
  getProviderNodeById,
} from "@/lib/localDb";
import {
  isOpenAICompatibleProvider,
  isAnthropicCompatibleProvider,
} from "../dashboard/src/constants/providers";

export interface TestResult {
  valid: boolean;
  error: string | null;
  latencyMs: number;
  testedAt: string;
}

interface ConnectionForTest {
  id: string;
  provider: string;
  apiKey?: string;
  authType?: string;
  providerSpecificData?: Record<string, unknown>;
  [key: string]: unknown;
}

// ─── Provider-specific test endpoints ─────────────────────────────────────────────

async function testOpenAI(apiKey: string): Promise<boolean> {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return res.ok;
}

async function testAnthropic(apiKey: string): Promise<boolean> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: 1,
      messages: [{ role: "user", content: "test" }],
    }),
  });
  // 401 means invalid key, 400+ other means key is valid (but may have other issues)
  return res.status !== 401 && res.status !== 403;
}

async function testGemini(apiKey: string): Promise<boolean> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`);
  return res.ok;
}

async function testOpenRouter(apiKey: string): Promise<boolean> {
  const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return res.ok;
}

async function testDeepSeek(apiKey: string): Promise<boolean> {
  const res = await fetch("https://api.deepseek.com/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return res.ok;
}

async function testGroq(apiKey: string): Promise<boolean> {
  const res = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return res.ok;
}

async function testMistral(apiKey: string): Promise<boolean> {
  const res = await fetch("https://api.mistral.ai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return res.ok;
}

async function testXAI(apiKey: string): Promise<boolean> {
  const res = await fetch("https://api.x.ai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return res.ok;
}

async function testNVIDIA(apiKey: string): Promise<boolean> {
  const res = await fetch("https://integrate.api.nvidia.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return res.ok;
}

async function testPerplexity(apiKey: string): Promise<boolean> {
  const res = await fetch("https://api.perplexity.ai/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return res.ok;
}

async function testTogether(apiKey: string): Promise<boolean> {
  const res = await fetch("https://api.together.xyz/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return res.ok;
}

async function testFireworks(apiKey: string): Promise<boolean> {
  const res = await fetch("https://api.fireworks.ai/inference/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return res.ok;
}

async function testCerebras(apiKey: string): Promise<boolean> {
  const res = await fetch("https://api.cerebras.ai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return res.ok;
}

async function testCohere(apiKey: string): Promise<boolean> {
  const res = await fetch("https://api.cohere.ai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return res.ok;
}

async function testNebius(apiKey: string): Promise<boolean> {
  const res = await fetch("https://api.studio.nebius.ai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return res.ok;
}

async function testSiliconFlow(apiKey: string): Promise<boolean> {
  const res = await fetch("https://api.siliconflow.cn/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return res.ok;
}

async function testHyperbolic(apiKey: string): Promise<boolean> {
  const res = await fetch("https://api.hyperbolic.xyz/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return res.ok;
}

async function testGLM(apiKey: string): Promise<boolean> {
  const res = await fetch("https://api.z.ai/api/anthropic/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "glm-4.7",
      max_tokens: 1,
      messages: [{ role: "user", content: "test" }],
    }),
  });
  return res.status !== 401 && res.status !== 403;
}

async function testGLMCN(apiKey: string): Promise<boolean> {
  const res = await fetch("https://open.bigmodel.cn/api/coding/paas/v4/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "glm-4.7",
      max_tokens: 1,
      messages: [{ role: "user", content: "test" }],
    }),
  });
  return res.status !== 401 && res.status !== 403;
}

async function testKimi(apiKey: string): Promise<boolean> {
  const res = await fetch("https://api.kimi.com/coding/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "kimi-latest",
      max_tokens: 1,
      messages: [{ role: "user", content: "test" }],
    }),
  });
  return res.status !== 401 && res.status !== 403;
}

async function testMiniMax(apiKey: string): Promise<boolean> {
  const res = await fetch("https://api.minimax.io/anthropic/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "minimax-m2",
      max_tokens: 1,
      messages: [{ role: "user", content: "test" }],
    }),
  });
  return res.status !== 401 && res.status !== 403;
}

async function testClaudeCN(apiKey: string): Promise<boolean> {
  const res = await fetch("https://api.minimaxi.com/anthropic/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "minimax-m2",
      max_tokens: 1,
      messages: [{ role: "user", content: "test" }],
    }),
  });
  return res.status !== 401 && res.status !== 403;
}

async function testAliCode(apiKey: string): Promise<boolean> {
  const res = await fetch("https://coding.dashscope.aliyuncs.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "qwen-coding-plus",
      max_tokens: 1,
      messages: [{ role: "user", content: "test" }],
    }),
  });
  return res.status !== 401 && res.status !== 403;
}

async function testAliCodeIntl(apiKey: string): Promise<boolean> {
  const res = await fetch("https://coding-intl.dashscope.aliyuncs.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "qwen-coding-plus",
      max_tokens: 1,
      messages: [{ role: "user", content: "test" }],
    }),
  });
  return res.status !== 401 && res.status !== 403;
}

async function testDeepgram(apiKey: string): Promise<boolean> {
  const res = await fetch("https://api.deepgram.com/v1/projects", {
    headers: { Authorization: `Token ${apiKey}` },
  });
  return res.ok;
}

async function testAssemblyAI(apiKey: string): Promise<boolean> {
  const res = await fetch("https://api.assemblyai.com/v1/account", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return res.ok;
}

async function testNanoBanana(apiKey: string): Promise<boolean> {
  const res = await fetch("https://api.nanobananaapi.ai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return res.ok;
}

async function testChutes(apiKey: string): Promise<boolean> {
  const res = await fetch("https://llm.chutes.ai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return res.ok;
}

async function testOllama(apiKey: string): Promise<boolean> {
  const res = await fetch("https://ollama.com/api/tags", {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
  });
  return res.ok;
}

async function testOllamaLocal(): Promise<boolean> {
  const res = await fetch("http://localhost:11434/api/tags");
  return res.ok;
}

async function testOpenAICompatible(
  apiKey: string,
  baseUrl: string
): Promise<{ valid: boolean; error: string | null }> {
  if (!baseUrl) return { valid: false, error: "Missing base URL" };
  try {
    const url = baseUrl.replace(/\/$/, "");

    // Try /models endpoint first
    let res = await fetch(`${url}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    // If /models fails, try /chat/completions with a minimal request
    if (!res.ok) {
      res = await fetch(`${url}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          max_tokens: 1,
          messages: [{ role: "user", content: "test" }],
        }),
      });
    }

    // If /chat/completions fails, try /status
    if (!res.ok) {
      res = await fetch(`${url.split("/v1")[0]}/api/user/status`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
    }

    return { valid: res.ok, error: res.ok ? null : "Invalid API key or base URL" };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }
}

async function testAnthropicCompatible(
  apiKey: string,
  baseUrl: string
): Promise<{ valid: boolean; error: string | null }> {
  if (!baseUrl) return { valid: false, error: "Missing base URL" };
  try {
    let url = baseUrl.replace(/\/$/, "");
    if (url.endsWith("/messages")) url = url.slice(0, -9);

    // Try /models endpoint first
    let res = await fetch(`${url}/models`, {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        Authorization: `Bearer ${apiKey}`,
      },
    });

    // If /models fails, try /messages with a minimal request
    if (!res.ok) {
      res = await fetch(`${url}/messages`, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 1,
          messages: [{ role: "user", content: "test" }],
        }),
      });
    }

    // If /messages fails, try /status
    if (!res.ok) {
      res = await fetch(`${url.split("/v1")[0]}/api/user/status`, {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          Authorization: `Bearer ${apiKey}`,
        },
      });
    }

    return { valid: res.ok, error: res.ok ? null : "Invalid API key or base URL" };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }
}

// ─── Main test function ─────────────────────────────────────────────────────────

async function testApiKeyConnection(connection: ConnectionForTest): Promise<TestResult> {
  const { provider, apiKey } = connection;
  const psd = connection.providerSpecificData as Record<string, unknown> | undefined;
  let baseUrl = (psd?.baseUrl ?? connection.baseUrl ?? "") as string;

  // For compatible providers, if baseUrl is not in connection, look up the provider node
  const isCompatible =
    isOpenAICompatibleProvider(provider) || isAnthropicCompatibleProvider(provider);
  if (!baseUrl && isCompatible) {
    const node = await getProviderNodeById(provider);
    if (node?.baseUrl) {
      console.log(`[PROVIDER_TEST] Using baseUrl from provider node ${provider}`);
      baseUrl = node.baseUrl;
    }
  }

  if (!apiKey) {
    return {
      valid: false,
      error: "No API key provided",
      latencyMs: 0,
      testedAt: new Date().toISOString(),
    };
  }

  const start = Date.now();
  let valid = false;
  let error: string | null = null;

  try {
    switch (provider) {
      case "openai":
        valid = await testOpenAI(apiKey);
        error = valid ? null : "Invalid API key";
        break;
      case "anthropic":
        valid = await testAnthropic(apiKey);
        error = valid ? null : "Invalid API key";
        break;
      case "gemini":
        valid = await testGemini(apiKey);
        error = valid ? null : "Invalid API key";
        break;
      case "openrouter":
        valid = await testOpenRouter(apiKey);
        error = valid ? null : "Invalid API key";
        break;
      case "deepseek":
        valid = await testDeepSeek(apiKey);
        error = valid ? null : "Invalid API key";
        break;
      case "groq":
        valid = await testGroq(apiKey);
        error = valid ? null : "Invalid API key";
        break;
      case "mistral":
        valid = await testMistral(apiKey);
        error = valid ? null : "Invalid API key";
        break;
      case "xai":
        valid = await testXAI(apiKey);
        error = valid ? null : "Invalid API key";
        break;
      case "nvidia":
        valid = await testNVIDIA(apiKey);
        error = valid ? null : "Invalid API key";
        break;
      case "perplexity":
        valid = await testPerplexity(apiKey);
        error = valid ? null : "Invalid API key";
        break;
      case "together":
        valid = await testTogether(apiKey);
        error = valid ? null : "Invalid API key";
        break;
      case "fireworks":
        valid = await testFireworks(apiKey);
        error = valid ? null : "Invalid API key";
        break;
      case "cerebras":
        valid = await testCerebras(apiKey);
        error = valid ? null : "Invalid API key";
        break;
      case "cohere":
        valid = await testCohere(apiKey);
        error = valid ? null : "Invalid API key";
        break;
      case "nebius":
        valid = await testNebius(apiKey);
        error = valid ? null : "Invalid API key";
        break;
      case "siliconflow":
        valid = await testSiliconFlow(apiKey);
        error = valid ? null : "Invalid API key";
        break;
      case "hyperbolic":
        valid = await testHyperbolic(apiKey);
        error = valid ? null : "Invalid API key";
        break;
      case "glm":
        valid = await testGLM(apiKey);
        error = valid ? null : "Invalid API key";
        break;
      case "glm-cn":
        valid = await testGLMCN(apiKey);
        error = valid ? null : "Invalid API key";
        break;
      case "kimi":
        valid = await testKimi(apiKey);
        error = valid ? null : "Invalid API key";
        break;
      case "minimax":
        valid = await testMiniMax(apiKey);
        error = valid ? null : "Invalid API key";
        break;
      case "deepseek-cn":
        valid = await testClaudeCN(apiKey);
        error = valid ? null : "Invalid API key";
        break;
      case "alicode":
        valid = await testAliCode(apiKey);
        error = valid ? null : "Invalid API key";
        break;
      case "alicode-intl":
        valid = await testAliCodeIntl(apiKey);
        error = valid ? null : "Invalid API key";
        break;
      case "deepgram":
        valid = await testDeepgram(apiKey);
        error = valid ? null : "Invalid API key";
        break;
      case "assemblyai":
        valid = await testAssemblyAI(apiKey);
        error = valid ? null : "Invalid API key";
        break;
      case "nanobanana":
        valid = await testNanoBanana(apiKey);
        error = valid ? null : "Invalid API key";
        break;
      case "chutes":
        valid = await testChutes(apiKey);
        error = valid ? null : "Invalid API key";
        break;
      case "ollama":
        valid = await testOllama(apiKey);
        error = valid ? null : "Invalid API key";
        break;
      case "ollama-local":
        valid = await testOllamaLocal();
        error = valid ? null : "Ollama not running on localhost:11434";
        break;
      default:
        if (isOpenAICompatibleProvider(provider)) {
          const result = await testOpenAICompatible(apiKey, baseUrl as string);
          valid = result.valid;
          error = result.error;
        } else if (isAnthropicCompatibleProvider(provider)) {
          const result = await testAnthropicCompatible(apiKey, baseUrl as string);
          valid = result.valid;
          error = result.error;
        } else {
          valid = false;
          error = "Provider test not supported";
        }
    }
  } catch (err) {
    valid = false;
    error = err instanceof Error ? err.message : "Test failed";
  }

  const latencyMs = Date.now() - start;

  return {
    valid,
    error,
    latencyMs,
    testedAt: new Date().toISOString(),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────────

/**
 * Test a provider connection by ID, update DB, and return result.
 */
export async function testProviderConnection(id: string): Promise<TestResult> {
  const connection = await getProviderConnectionById(id);
  if (!connection) {
    console.log(`[PROVIDER_TEST] Connection ${id} not found`);
    return {
      valid: false,
      error: "Connection not found",
      latencyMs: 0,
      testedAt: new Date().toISOString(),
    };
  }

  console.log(`[PROVIDER_TEST] Testing connection ${id} (${connection.provider})`);

  let result: TestResult;

  // Check if connection has credentials to test
  const hasApiKey = connection.authType === "apikey" || connection.apiKey;
  const psd = connection.providerSpecificData as Record<string, unknown> | undefined;
  const hasOAuthToken = connection.accessToken || psd?.accessToken;

  if (hasApiKey) {
    // API key providers
    result = await testApiKeyConnection(connection);
  } else if (hasOAuthToken) {
    // OAuth providers - check if token exists and is not expired
    const token = (connection.accessToken || psd?.accessToken) as string;
    const expiresAt = (connection.expiresAt || psd?.expiresAt) as string | undefined;

    // Check if token is expired
    const isExpired = expiresAt ? new Date(expiresAt) <= new Date() : false;

    if (isExpired) {
      result = {
        valid: false,
        error: "Token expired. Please re-authorize.",
        latencyMs: 0,
        testedAt: new Date().toISOString(),
      };
    } else if (token) {
      // For OAuth providers, we can't make API calls without proper OAuth test endpoints
      // Just verify token exists and is not expired
      result = {
        valid: true,
        error: null,
        latencyMs: 0,
        testedAt: new Date().toISOString(),
      };
    } else {
      result = {
        valid: false,
        error: "No access token found. Please re-authorize.",
        latencyMs: 0,
        testedAt: new Date().toISOString(),
      };
    }
  } else {
    // No credentials to test
    result = {
      valid: false,
      error: "No credentials found. Please add an API key or authorize via OAuth.",
      latencyMs: 0,
      testedAt: new Date().toISOString(),
    };
  }

  // Update connection with test results
  await updateProviderConnection(id, {
    testStatus: result.valid ? "active" : "error",
    lastError: result.valid ? null : result.error,
    lastErrorAt: result.valid ? null : new Date().toISOString(),
    lastTested: result.testedAt,
  });

  // Log test result
  if (result.valid) {
    console.log(
      `[PROVIDER_TEST] Connection ${id} (${connection.provider}) PASSED (${result.latencyMs}ms)`
    );
  } else {
    console.log(
      `[PROVIDER_TEST] Connection ${id} (${connection.provider}) FAILED - ${result.error}`
    );
  }

  return result;
}

/**
 * Test multiple provider connections.
 * @param mode - Test mode: "provider", "oauth", "free", "apikey", "compatible", "all"
 * @param providerId - Optional provider ID for mode="provider"
 */
export async function testProviderConnections(
  mode: string,
  providerId?: string
): Promise<{
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
}> {
  const { getProviderConnections } = await import("@/lib/localDb");
  const allConnections = await getProviderConnections();

  let connectionsToTest = allConnections.filter((c: ConnectionForTest) => {
    // Skip connections without API keys
    if (!c.apiKey) return false;

    if (mode === "provider" && providerId) {
      return c.provider === providerId;
    }
    if (mode === "apikey") {
      return c.authType === "apikey" || !!c.apiKey;
    }
    if (mode === "all") {
      return true;
    }
    return false;
  });

  const results = [];

  for (const conn of connectionsToTest) {
    try {
      const data = await testProviderConnection(conn.id);
      results.push({
        provider: conn.provider,
        connectionId: conn.id,
        connectionName: (conn.name as string) || conn.provider,
        authType: (conn.authType as string) || "apikey",
        valid: data.valid,
        latencyMs: data.latencyMs,
        error: data.error,
        testedAt: data.testedAt,
      });
    } catch (error) {
      results.push({
        provider: conn.provider,
        connectionId: conn.id,
        connectionName: (conn.name as string) || conn.provider,
        authType: (conn.authType as string) || "apikey",
        valid: false,
        latencyMs: 0,
        error: error instanceof Error ? error.message : "Test failed",
        testedAt: new Date().toISOString(),
      });
    }
  }

  return {
    mode,
    providerId: providerId || null,
    results,
    testedAt: new Date().toISOString(),
    summary: {
      total: results.length,
      passed: results.filter((r) => r.valid).length,
      failed: results.filter((r) => !r.valid).length,
    },
  };
}
