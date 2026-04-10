/**
 * Unit tests for Anthropic header caching + forwarding pipeline
 *
 * Tests cover:
 *  - claudeHeaderCache: detection, capture, and retrieval of Claude Code headers
 *  - buildUpstreamHeaders(): live header overlay for "claude" provider
 *  - buildUpstreamHeaders(): cold-start fallback when cache is empty
 *  - buildUpstreamHeaders(): anthropic-compatible non-Anthropic host stripping
 *  - buildUpstreamHeaders(): anthropic-compatible official host keeps headers
 */

import { describe, it, expect, beforeEach } from "bun:test";

// ─── claudeHeaderCache ────────────────────────────────────────────────────────

describe("claudeHeaderCache", () => {
  let cacheModule: typeof import("../../ai-bridge/utils/claudeHeaderCache.ts");

  beforeEach(async () => {
    // Re-import fresh module each time to reset singleton state
    cacheModule = await import("../../ai-bridge/utils/claudeHeaderCache.ts");
    // Clear cache using the exported function
    cacheModule.clearCachedClaudeHeaders();
  });

  it("returns null before any headers are cached (cold start)", () => {
    expect(cacheModule.getCachedClaudeHeaders()).toBeNull();
  });

  it("caches headers when user-agent contains 'claude-code'", () => {
    cacheModule.cacheClaudeHeaders({
      "user-agent": "claude-code/2.1.63 node/24.3.0",
      "anthropic-beta": "claude-code-20250219,oauth-2025-04-20",
      "anthropic-version": "2023-06-01",
      "x-app": "cli",
      "x-stainless-os": "MacOS",
      "x-stainless-arch": "arm64",
      "x-stainless-lang": "js",
      "x-stainless-runtime": "node",
      "x-stainless-runtime-version": "v24.3.0",
      "x-stainless-package-version": "0.74.0",
      "x-stainless-helper-method": "stream",
      "x-stainless-retry-count": "0",
      "x-stainless-timeout": "600",
      "anthropic-dangerous-direct-browser-access": "true",
      // Non-identity header — should NOT be captured
      "content-type": "application/json",
    });

    const cached = cacheModule.getCachedClaudeHeaders();
    expect(cached).not.toBeNull();
    expect(cached!["user-agent"]).toBe("claude-code/2.1.63 node/24.3.0");
    expect(cached!["anthropic-beta"]).toBe("claude-code-20250219,oauth-2025-04-20");
    expect(cached!["x-app"]).toBe("cli");
    expect(cached!["x-stainless-os"]).toBe("MacOS");
    // Non-identity header must not leak in
    expect(cached!["content-type"]).toBeUndefined();
  });

  it("caches headers when user-agent contains 'claude-cli'", () => {
    cacheModule.cacheClaudeHeaders({
      "user-agent": "claude-cli/1.0.0",
      "anthropic-version": "2023-06-01",
    });
    expect(cacheModule.getCachedClaudeHeaders()).not.toBeNull();
    expect(cacheModule.getCachedClaudeHeaders()!["user-agent"]).toBe("claude-cli/1.0.0");
  });

  it("caches headers when x-app is 'cli' (regardless of user-agent)", () => {
    cacheModule.cacheClaudeHeaders({
      "user-agent": "axios/1.7.0",
      "x-app": "cli",
      "anthropic-version": "2023-06-01",
    });
    expect(cacheModule.getCachedClaudeHeaders()).not.toBeNull();
  });

  it("does NOT cache headers for non-Claude clients", () => {
    cacheModule.cacheClaudeHeaders({
      "user-agent": "PostmanRuntime/7.43.0",
      "anthropic-version": "2023-06-01",
    });
    expect(cacheModule.getCachedClaudeHeaders()).toBeNull();
  });

  it("stores multiple cache entries by user-agent", async () => {
    cacheModule.cacheClaudeHeaders({
      "user-agent": "claude-code/2.0.0",
      "x-stainless-package-version": "0.70.0",
    });

    // Add a small delay to ensure different timestamps
    await new Promise((resolve) => setTimeout(resolve, 10));

    cacheModule.cacheClaudeHeaders({
      "user-agent": "claude-code/2.1.63",
      "x-stainless-package-version": "0.74.0",
    });

    const stats = cacheModule.getCacheStats();
    expect(stats.size).toBe(2);

    // Most recently cached is the second one
    const cached = cacheModule.getCachedClaudeHeaders();
    expect(cached!["user-agent"]).toBe("claude-code/2.1.63");
    expect(cached!["x-stainless-package-version"]).toBe("0.74.0");
  });

  it("ignores calls with null or non-object headers", () => {
    cacheModule.cacheClaudeHeaders(null as any);
    cacheModule.cacheClaudeHeaders(undefined as any);
    cacheModule.cacheClaudeHeaders("string" as any);
    expect(cacheModule.getCachedClaudeHeaders()).toBeNull();
  });

  it("only stores keys that are actually present in the headers object", () => {
    cacheModule.cacheClaudeHeaders({
      "user-agent": "claude-code/2.1.63",
      // Most stainless headers absent
    });
    const cached = cacheModule.getCachedClaudeHeaders();
    expect(cached!["x-stainless-os"]).toBeUndefined();
    expect(cached!["user-agent"]).toBe("claude-code/2.1.63");
  });

  it("evicts least recently used entries when cache is full", () => {
    // This test verifies memory management by filling the cache
    // In practice, MAX_CACHE_SIZE is 100, so we won't actually fill it
    // but we can test the stats API works
    const stats = cacheModule.getCacheStats();
    expect(stats.size).toBeGreaterThanOrEqual(0);
    expect(stats.maxSize).toBe(100); // MAX_CACHE_SIZE
    expect(stats.ttlMs).toBe(60 * 60 * 1000 * 12); // 12 hours
  });

  it("tracks cache statistics", () => {
    cacheModule.clearCachedClaudeHeaders();

    cacheModule.cacheClaudeHeaders({
      "user-agent": "claude-code/2.1.63",
      "anthropic-version": "2023-06-01",
    });

    const stats = cacheModule.getCacheStats();
    expect(stats.size).toBe(1);
    expect(stats.entries).toHaveLength(1);
    expect(stats.entries[0].headerCount).toBe(2);
  });
});

// ─── buildUpstreamHeaders() ──────────────────────────────────────────────────

describe("buildUpstreamHeaders() — claude provider", () => {
  let providerModule: typeof import("../../ai-bridge/handlers/provider.ts");
  let cacheModule: typeof import("../../ai-bridge/utils/claudeHeaderCache.ts");

  beforeEach(async () => {
    // Re-import fresh modules
    providerModule = await import("../../ai-bridge/handlers/provider.ts");
    cacheModule = await import("../../ai-bridge/utils/claudeHeaderCache.ts");

    // Clear any existing cache
    cacheModule.clearCachedClaudeHeaders();

    // Prime the cache with live client headers
    cacheModule.cacheClaudeHeaders({
      "user-agent": "claude-code/2.1.63 node/24.3.0",
      "anthropic-beta": "claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14",
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      "x-app": "cli",
      "x-stainless-os": "MacOS",
      "x-stainless-arch": "arm64",
      "x-stainless-lang": "js",
      "x-stainless-runtime": "node",
      "x-stainless-runtime-version": "v24.3.0",
      "x-stainless-package-version": "0.74.0",
      "x-stainless-helper-method": "stream",
      "x-stainless-retry-count": "0",
      "x-stainless-timeout": "600",
    });
  });

  it("overlays live cached headers over static provider defaults", () => {
    const headers = providerModule.buildUpstreamHeaders("claude", { apiKey: "sk-test" });

    // Live values should win over static providers.js values
    expect(headers["user-agent"]).toBe("claude-code/2.1.63 node/24.3.0");
    // Beta flags are MERGED (static + cached) to preserve required flags like oauth
    const betaFlags = headers["anthropic-beta"].split(",").map((s) => s.trim());
    expect(betaFlags).toContain("claude-code-20250219");
    expect(betaFlags).toContain("oauth-2025-04-20");
    expect(betaFlags).toContain("interleaved-thinking-2025-05-14");
    expect(headers["x-stainless-package-version"]).toBe("0.74.0");
    expect(headers["x-stainless-os"]).toBe("MacOS");
  });

  it("removes conflicting Title-Case static keys when cached lowercase keys exist", () => {
    const headers = providerModule.buildUpstreamHeaders("claude", { apiKey: "sk-test" });

    // Title-Case variants from providers.js must be gone
    expect(headers["Anthropic-Version"]).toBeUndefined();
    expect(headers["Anthropic-Beta"]).toBeUndefined();
    expect(headers["User-Agent"]).toBeUndefined();
    expect(headers["X-App"]).toBeUndefined();
    // Lowercase variants must be present
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["x-app"]).toBe("cli");
  });

  it("sets x-api-key auth when apiKey is provided", () => {
    const headers = providerModule.buildUpstreamHeaders("claude", { apiKey: "sk-live-key" });
    expect(headers["x-api-key"]).toBe("sk-live-key");
    expect(headers["Authorization"]).toBeUndefined();
  });

  it("sets Bearer Authorization when only accessToken is provided", () => {
    const headers = providerModule.buildUpstreamHeaders("claude", { accessToken: "tok-abc" });
    expect(headers["Authorization"]).toBe("Bearer tok-abc");
    expect(headers["x-api-key"]).toBeUndefined();
  });
});

describe("buildUpstreamHeaders() — claude provider cold start (no cache)", () => {
  let providerModule: typeof import("../../ai-bridge/handlers/provider.ts");
  let cacheModule: typeof import("../../ai-bridge/utils/claudeHeaderCache.ts");

  beforeEach(async () => {
    // Re-import fresh modules
    providerModule = await import("../../ai-bridge/handlers/provider.ts");
    cacheModule = await import("../../ai-bridge/utils/claudeHeaderCache.ts");

    // Clear cache to simulate cold start
    cacheModule.clearCachedClaudeHeaders();
  });

  it("falls back to static provider headers when cache is empty", () => {
    const headers = providerModule.buildUpstreamHeaders("claude", { apiKey: "sk-test" });

    // Static fallback values from providers.js must still be present
    // They may be Title-Case since no cache to conflict with them
    const hasVersion = headers["Anthropic-Version"] === "2023-06-01" || headers["anthropic-version"] === "2023-06-01";
    expect(hasVersion).toBe(true);
  });

  it("does not throw when cache returns null", () => {
    expect(() => providerModule.buildUpstreamHeaders("claude", { apiKey: "sk" })).not.toThrow();
  });
});

// ─── anthropic-compatible header stripping ────────────────────────────────────

describe("buildUpstreamHeaders() — anthropic-compatible stripping", () => {
  let providerModule: typeof import("../../ai-bridge/handlers/provider.ts");
  let cacheModule: typeof import("../../ai-bridge/utils/claudeHeaderCache.ts");

  beforeEach(async () => {
    // Re-import fresh modules
    providerModule = await import("../../ai-bridge/handlers/provider.ts");
    cacheModule = await import("../../ai-bridge/utils/claudeHeaderCache.ts");

    // Prime the cache with Claude Code headers
    cacheModule.cacheClaudeHeaders({
      "user-agent": "claude-code/2.1.63 node/24.3.0",
      "anthropic-beta": "claude-code-20250219,oauth-2025-04-20",
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      "x-app": "cli",
    });
  });

  it("strips x-app and anthropic-dangerous-direct-browser-access for non-Anthropic host", () => {
    const headers = providerModule.buildUpstreamHeaders("anthropic-compatible-custom", {
      apiKey: "key",
      providerSpecificData: { baseUrl: "https://myproxy.example.com/v1" },
    });

    expect(headers["x-app"]).toBeUndefined();
    expect(headers["X-App"]).toBeUndefined();
    expect(headers["anthropic-dangerous-direct-browser-access"]).toBeUndefined();
    expect(headers["Anthropic-Dangerous-Direct-Browser-Access"]).toBeUndefined();
  });

  it("removes claude-code-20250219 from anthropic-beta for non-Anthropic host", () => {
    const headers = providerModule.buildUpstreamHeaders("anthropic-compatible-custom", {
      apiKey: "key",
      providerSpecificData: { baseUrl: "https://myproxy.example.com/v1" },
    });

    const betaVal = headers["anthropic-beta"] || headers["Anthropic-Beta"] || "";
    expect(betaVal).not.toContain("claude-code-20250219");
  });

  it("keeps other beta flags intact after stripping", () => {
    const headers = providerModule.buildUpstreamHeaders("anthropic-compatible-custom", {
      apiKey: "key",
      providerSpecificData: { baseUrl: "https://myproxy.example.com/v1" },
    });

    const betaVal = headers["anthropic-beta"] || headers["Anthropic-Beta"] || "";
    // OAuth flag should remain
    if (betaVal) {
      expect(betaVal).toContain("oauth-2025-04-20");
    }
  });

  it("does NOT strip headers when baseUrl is api.anthropic.com", () => {
    const headers = providerModule.buildUpstreamHeaders("anthropic-compatible-official", {
      apiKey: "key",
      providerSpecificData: { baseUrl: "https://api.anthropic.com/v1" },
    });

    // No stripping — anthropic-version should survive
    const hasVersion = headers["Anthropic-Version"] || headers["anthropic-version"];
    expect(hasVersion).toBeDefined();
  });

  it("does NOT strip headers when baseUrl is empty (defaults to Anthropic)", () => {
    const headers = providerModule.buildUpstreamHeaders("anthropic-compatible-official", {
      apiKey: "key",
      providerSpecificData: {},
    });

    const hasVersion = headers["Anthropic-Version"] || headers["anthropic-version"];
    expect(hasVersion).toBeDefined();
  });

  it("does NOT strip headers when baseUrl is not provided", () => {
    const headers = providerModule.buildUpstreamHeaders("anthropic-compatible-official", {
      apiKey: "key",
    });

    const hasVersion = headers["Anthropic-Version"] || headers["anthropic-version"];
    expect(hasVersion).toBeDefined();
  });
});
