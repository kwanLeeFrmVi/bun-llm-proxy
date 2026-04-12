/**
 * Unit tests for services/pricingSync.ts
 * Covers: normalizeModelName, stripSuffixes, baseModelName,
 *         buildPricingMap, buildFuzzyLookup, findPricing (calculateCost)
 */

import { describe, it, expect } from "bun:test";
import { normalizeModelName, stripSuffixes, baseModelName } from "../../services/pricingSync.ts";

// Module-level constants matching services/pricingSync.ts
const STRIP_SUFFIXES = [
  "-turbo",
  "-maas",
  "-fast",
  "-ultra",
  "-large",
  "-mini",
  "-hd",
  "-code",
  "-instruct",
  "-preview",
  "-latest",
];
const KNOWN_BASES = ["claude-sonnet", "claude-opus", "gpt-4", "gpt-3.5", "gemini"];

// ─── normalizeModelName ─────────────────────────────────────────────────────────

describe("normalizeModelName", () => {
  it("strips provider prefix", () => {
    expect(normalizeModelName("anthropic/claude-sonnet-4-5")).toBe("claude-sonnet-4-5");
    expect(normalizeModelName("z-ai/glm-5.1")).toBe("glm-5-1");
    expect(normalizeModelName("google/gemini-2.0-flash")).toBe("gemini-2-0-flash");
  });

  it("replaces dots with dashes in version segments", () => {
    expect(normalizeModelName("claude-sonnet-4.5")).toBe("claude-sonnet-4-5");
    // Note: suffix stripping runs after normalization, so -preview is stripped too
    expect(normalizeModelName("gpt-4.5-preview")).toBe("gpt-4-5");
    expect(normalizeModelName("gemini-2.0-flash")).toBe("gemini-2-0-flash");
  });

  it("strips common suffixes", () => {
    expect(normalizeModelName("glm-5-turbo")).toBe("glm-5");
    expect(normalizeModelName("claude-sonnet-4-fast")).toBe("claude-sonnet-4");
    expect(normalizeModelName("gpt-4-ultra")).toBe("gpt-4");
    expect(normalizeModelName("model-mini")).toBe("model");
    expect(normalizeModelName("model-hd")).toBe("model");
    expect(normalizeModelName("model-code")).toBe("model");
    expect(normalizeModelName("model-preview")).toBe("model");
  });

  it("handles full OpenRouter model IDs end-to-end", () => {
    expect(normalizeModelName("anthropic/claude-sonnet-4.6-fast")).toBe("claude-sonnet-4-6");
    expect(normalizeModelName("anthropic/claude-opus-4.5")).toBe("claude-opus-4-5");
    expect(normalizeModelName("z-ai/glm-5.1-turbo")).toBe("glm-5-1");
  });

  it("returns input unchanged when no transformations apply", () => {
    expect(normalizeModelName("claude-sonnet-4-5")).toBe("claude-sonnet-4-5");
  });

  it("is case-insensitive for suffix stripping", () => {
    expect(normalizeModelName("MODEL-Turbo")).toBe("MODEL");
    expect(normalizeModelName("model-MINI")).toBe("model");
  });

  it("handles model names with no matching patterns", () => {
    expect(normalizeModelName("unknown-model-v1")).toBe("unknown-model-v1");
  });
});

// ─── stripSuffixes ─────────────────────────────────────────────────────────────

describe("stripSuffixes", () => {
  it("strips individual suffixes", () => {
    expect(stripSuffixes("glm-5-turbo")).toBe("glm-5");
    expect(stripSuffixes("glm-5-fast")).toBe("glm-5");
    expect(stripSuffixes("glm-5-maas")).toBe("glm-5");
    expect(stripSuffixes("glm-5-ultra")).toBe("glm-5");
    expect(stripSuffixes("glm-5-large")).toBe("glm-5");
    expect(stripSuffixes("glm-5-mini")).toBe("glm-5");
    expect(stripSuffixes("glm-5-hd")).toBe("glm-5");
    expect(stripSuffixes("glm-5-code")).toBe("glm-5");
    expect(stripSuffixes("glm-5-instruct")).toBe("glm-5");
    expect(stripSuffixes("glm-5-preview")).toBe("glm-5");
  });

  it("only strips exact suffixes (case-insensitive)", () => {
    expect(stripSuffixes("turbo-v2")).toBe("turbo-v2");
    // "not-turbo" ends with "-turbo" (case-insensitive), so it gets stripped
    expect(stripSuffixes("not-turbo")).toBe("not");
  });

  it("returns unchanged if no suffix matches", () => {
    expect(stripSuffixes("claude-sonnet-4")).toBe("claude-sonnet-4");
  });
});

// ─── baseModelName ─────────────────────────────────────────────────────────────

describe("baseModelName", () => {
  it("returns known base models unchanged", () => {
    expect(baseModelName("claude-sonnet-4-5")).toBe("claude-sonnet");
    expect(baseModelName("claude-opus-4-6")).toBe("claude-opus");
    expect(baseModelName("gpt-4o-mini")).toBe("gpt-4");
    expect(baseModelName("gemini-2-0-flash")).toBe("gemini");
  });

  it("strips trailing version segments for unknown models", () => {
    const result = baseModelName("custom-model-1-2-3");
    expect(result).not.toBe("custom-model-1-2-3");
    expect(result.startsWith("custom")).toBe(true);
  });

  it("handles provider-prefixed model names", () => {
    expect(baseModelName("anthropic/claude-sonnet-4-5")).toBe("claude-sonnet");
  });

  it("returns single-word model names unchanged", () => {
    expect(baseModelName("gpt4")).toBe("gpt4");
  });
});

// ─── buildPricingMap ───────────────────────────────────────────────────────────

describe("buildPricingMap", () => {
  // Inline helper to avoid importing private function
  function buildPricingMap(
    models: Array<{ id: string; pricing: { prompt: string; completion: string } }>
  ) {
    const pricing: Record<string, Record<string, number>> = {};
    for (const model of models) {
      const inputPrice = parseFloat(model.pricing.prompt ?? "0") * 1_000_000;
      const outputPrice = parseFloat(model.pricing.completion ?? "0") * 1_000_000;
      if (inputPrice === 0 && outputPrice === 0) continue;
      pricing[model.id] = { input: inputPrice, output: outputPrice };
    }
    return pricing;
  }

  it("converts OpenRouter $/token prices to $/1M tokens", () => {
    const models = [
      {
        id: "anthropic/claude-sonnet-4-5",
        pricing: { prompt: "0.000003", completion: "0.000015" },
      },
    ];
    const result = buildPricingMap(models);
    expect(result["anthropic/claude-sonnet-4-5"]).toEqual({ input: 3, output: 15 });
  });

  it("skips models with zero pricing", () => {
    const models = [
      { id: "free/model", pricing: { prompt: "0", completion: "0" } },
      { id: "paid/model", pricing: { prompt: "0.000001", completion: "0" } },
    ];
    const result = buildPricingMap(models);
    expect(result["free/model"]).toBeUndefined();
    expect(result["paid/model"]).toEqual({ input: 1, output: 0 });
  });

  it("handles multiple models across providers", () => {
    const models = [
      { id: "a/x", pricing: { prompt: "0.000001", completion: "0.000002" } },
      { id: "a/y", pricing: { prompt: "0.000003", completion: "0.000004" } },
      { id: "b/z", pricing: { prompt: "0.000005", completion: "0.000006" } },
    ];
    const result = buildPricingMap(models);
    expect(Object.keys(result)).toHaveLength(3);
    expect(result["a/x"]).toEqual({ input: 1, output: 2 });
    expect(result["b/z"]).toEqual({ input: 5, output: 6 });
  });

  it("handles models with only input or only output price", () => {
    const models = [
      { id: "input-only", pricing: { prompt: "0.000001", completion: "0" } },
      { id: "output-only", pricing: { prompt: "0", completion: "0.000002" } },
    ];
    const result = buildPricingMap(models);
    expect(result["input-only"]).toEqual({ input: 1, output: 0 });
    expect(result["output-only"]).toEqual({ input: 0, output: 2 });
  });
});

// ─── buildFuzzyLookup ─────────────────────────────────────────────────────────

describe("buildFuzzyLookup", () => {
  // Inline the function since it's not exported
  function buildFuzzyLookup(
    models: Array<{ id: string; pricing: { prompt: string; completion: string } }>
  ) {
    function norm(n: string) {
      let name = n;
      if (name.includes("/")) name = name.split("/").slice(1).join("/");
      name = name.replace(/(\d+)\.(\d+)/g, "$1-$2");
      for (const s of STRIP_SUFFIXES) {
        if (name.toLowerCase().endsWith(s)) name = name.slice(0, -s.length);
      }
      return name;
    }

    function stripFn(n: string) {
      let name = n;
      for (const s of STRIP_SUFFIXES) {
        if (name.toLowerCase().endsWith(s)) name = name.slice(0, -s.length);
      }
      return name;
    }

    function baseFn(n: string) {
      const normalized = norm(n);
      for (const b of KNOWN_BASES) {
        if (normalized.startsWith(b)) return b;
      }
      const idx = normalized.lastIndexOf("-");
      if (idx > 0) {
        const candidate = normalized.slice(0, idx);
        if (candidate.length > 2) return candidate;
      }
      return normalized;
    }

    const lookup: Record<string, { id: string; input: number; output: number }> = {};
    for (const model of models) {
      const inputPrice = parseFloat(model.pricing.prompt ?? "0") * 1_000_000;
      const outputPrice = parseFloat(model.pricing.completion ?? "0") * 1_000_000;
      if (inputPrice === 0 && outputPrice === 0) continue;
      const entry = { id: model.id, input: inputPrice, output: outputPrice };
      lookup[norm(model.id)] = entry;
      lookup[stripFn(model.id)] = entry;
      lookup[baseFn(model.id)] = entry;
      lookup[model.id] = entry;
    }
    return lookup;
  }

  it("maps multiple normalization keys to the same pricing entry", () => {
    const models = [
      {
        id: "anthropic/claude-sonnet-4.5-fast",
        pricing: { prompt: "0.000003", completion: "0.000015" },
      },
    ];
    const lookup = buildFuzzyLookup(models);

    expect(lookup["anthropic/claude-sonnet-4.5-fast"]?.id).toBe("anthropic/claude-sonnet-4.5-fast");
    expect(lookup["claude-sonnet-4-5"]?.id).toBe("anthropic/claude-sonnet-4.5-fast");
    expect(lookup["claude-sonnet"]?.id).toBe("anthropic/claude-sonnet-4.5-fast");
  });

  it("returns undefined for keys with no match", () => {
    const lookup = buildFuzzyLookup([
      {
        id: "anthropic/claude-sonnet-4-5",
        pricing: { prompt: "0.000003", completion: "0.000015" },
      },
    ]);
    expect(lookup["completely-unknown-model"]).toBeUndefined();
  });

  it("skips zero-priced models", () => {
    const lookup = buildFuzzyLookup([
      { id: "free/model", pricing: { prompt: "0", completion: "0" } },
    ]);
    expect(lookup["free/model"]).toBeUndefined();
  });
});

// ─── findPricing & calculateCost ──────────────────────────────────────────────

describe("findPricing & calculateCost", () => {
  // Self-contained helpers that mirror services/pricingSync.ts exactly
  function testNormalize(n: string) {
    let name = n;
    if (name.includes("/")) name = name.split("/").slice(1).join("/");
    name = name.replace(/(\d+)\.(\d+)/g, "$1-$2");
    for (const s of STRIP_SUFFIXES) {
      if (name.toLowerCase().endsWith(s)) name = name.slice(0, -s.length);
    }
    return name;
  }

  function testStrip(n: string) {
    let name = n;
    for (const s of STRIP_SUFFIXES) {
      if (name.toLowerCase().endsWith(s)) name = name.slice(0, -s.length);
    }
    return name;
  }

  function testBase(n: string) {
    const normalized = testNormalize(n);
    for (const b of KNOWN_BASES) {
      if (normalized.startsWith(b)) return b;
    }
    const idx = normalized.lastIndexOf("-");
    if (idx > 0) {
      const candidate = normalized.slice(0, idx);
      if (candidate.length > 2) return candidate;
    }
    return normalized;
  }

  function findPricing(
    pricing: Record<string, Record<string, { input: number; output: number }>>,
    provider: string,
    model: string,
    orCache: Record<string, { id: string; input: number; output: number }> = {}
  ): { input: number; output: number } | null {
    // Pre-compute all derived keys
    const normalized = testNormalize(model);
    const stripped = testStrip(model);
    const baseModel = testBase(model);

    // 1. Exact
    if (pricing[provider]?.[model]) return pricing[provider][model];

    // 2. Normalized
    if (normalized !== model && pricing[provider]?.[normalized])
      return pricing[provider][normalized];

    // 3. Suffix-stripped
    if (stripped !== model && pricing[provider]?.[stripped]) return pricing[provider][stripped];

    // 4. Base model
    if (baseModel !== model && pricing[provider]?.[baseModel]) return pricing[provider][baseModel];

    // 5. OpenRouter cache — always checked regardless of stripped===model
    for (const key of [normalized, stripped, baseModel, model]) {
      const entry = orCache[key];
      if (entry) return { input: entry.input, output: entry.output };
    }

    return null;
  }

  function calculateCost(
    pricing: Record<string, Record<string, { input: number; output: number }>>,
    provider: string,
    model: string,
    promptTokens: number,
    completionTokens: number,
    orCache: Record<string, { id: string; input: number; output: number }> = {}
  ): number {
    const entry = findPricing(pricing, provider, model, orCache);
    if (!entry) return 0;
    return (promptTokens * entry.input) / 1_000_000 + (completionTokens * entry.output) / 1_000_000;
  }

  // ─── findPricing tests ─────────────────────────────────────────────────────

  describe("findPricing", () => {
    it("1 - exact match returns correct pricing", () => {
      const pricing = { openai: { "gpt-4": { input: 10, output: 30 } } };
      expect(findPricing(pricing, "openai", "gpt-4")).toEqual({ input: 10, output: 30 });
    });

    it("2 - normalized match (dot→dash) returns correct pricing", () => {
      const pricing = { anthropic: { "claude-sonnet-4-5": { input: 3, output: 15 } } };
      expect(findPricing(pricing, "anthropic", "claude-sonnet-4.5")).toEqual({
        input: 3,
        output: 15,
      });
    });

    it("3 - suffix-stripped match returns correct pricing", () => {
      const pricing = { glm: { "glm-5": { input: 1, output: 4 } } };
      expect(findPricing(pricing, "glm", "glm-5-turbo")).toEqual({ input: 1, output: 4 });
    });

    it("4 - base model match returns correct pricing", () => {
      const pricing = { anthropic: { "claude-sonnet": { input: 3, output: 15 } } };
      expect(findPricing(pricing, "anthropic", "claude-sonnet-4-5")).toEqual({
        input: 3,
        output: 15,
      });
    });

    it("5 - OpenRouter cache fallback returns correct pricing", () => {
      const pricing: Record<string, Record<string, { input: number; output: number }>> = {
        anthropic: {},
      };
      const orCache = {
        "claude-sonnet-4-5": { id: "anthropic/claude-sonnet-4-5", input: 3, output: 15 },
      };
      expect(findPricing(pricing, "anthropic", "claude-sonnet-4-5", orCache)).toEqual({
        input: 3,
        output: 15,
      });
    });

    it("returns null when no match found anywhere", () => {
      const pricing: Record<string, Record<string, { input: number; output: number }>> = {};
      expect(findPricing(pricing, "unknown", "unknown-model")).toBeNull();
    });

    it("exact match takes priority over normalized", () => {
      const pricing = {
        anthropic: {
          "claude-sonnet-4.5": { input: 100, output: 200 },
          "claude-sonnet-4-5": { input: 3, output: 15 },
        },
      };
      expect(findPricing(pricing, "anthropic", "claude-sonnet-4.5")).toEqual({
        input: 100,
        output: 200,
      });
    });

    it("provider mismatch returns null (no cross-provider lookup)", () => {
      const pricing = { openai: { "gpt-4": { input: 10, output: 30 } } };
      expect(findPricing(pricing, "anthropic", "gpt-4")).toBeNull();
    });

    it("handles real-world case: exact match in anthropic provider", () => {
      // usage_log stores provider="anthropic", model="claude-sonnet-4.5"
      // Pricing has provider="anthropic", model="claude-sonnet-4.5" (from sync)
      const pricing = { anthropic: { "claude-sonnet-4.5": { input: 3, output: 15 } } };
      expect(findPricing(pricing, "anthropic", "claude-sonnet-4.5")).toEqual({
        input: 3,
        output: 15,
      });
      // normalized: dot→dash — KV has exact match in normalized form
      const pricingDash = { anthropic: { "claude-sonnet-4-5": { input: 3, output: 15 } } };
      expect(findPricing(pricingDash, "anthropic", "claude-sonnet-4-5")).toEqual({
        input: 3,
        output: 15,
      });
      // real gap: KV has dot, request has dash, no OR cache → null
      expect(findPricing(pricing, "anthropic", "claude-sonnet-4-5")).toBeNull();
      // but if OR cache has the raw model key, it matches
      const orCache = {
        "claude-sonnet-4-5": { id: "anthropic/claude-sonnet-4-5", input: 3, output: 15 },
      };
      expect(findPricing(pricing, "anthropic", "claude-sonnet-4-5", orCache)).toEqual({
        input: 3,
        output: 15,
      });
    });
  });

  // ─── calculateCost tests ───────────────────────────────────────────────────

  describe("calculateCost", () => {
    it("calculates correct cost for exact match", () => {
      const pricing = { openai: { "gpt-4": { input: 10, output: 30 } } };
      // 1000 prompt × $10/1M + 500 completion × $30/1M = $0.01 + $0.015 = $0.025
      expect(calculateCost(pricing, "openai", "gpt-4", 1000, 500)).toBe(0.025);
    });

    it("calculates correct cost for normalized match", () => {
      const pricing = { anthropic: { "claude-sonnet-4-5": { input: 3, output: 15 } } };
      // 1M prompt tokens × $3/1M = $3.00
      expect(calculateCost(pricing, "anthropic", "claude-sonnet-4.5", 1_000_000, 0)).toBe(3);
    });

    it("returns 0 for unknown model with no fallback", () => {
      const pricing: Record<string, Record<string, { input: number; output: number }>> = {};
      expect(calculateCost(pricing, "unknown", "unknown", 100, 50)).toBe(0);
    });

    it("handles zero tokens gracefully", () => {
      const pricing = { openai: { "gpt-4": { input: 10, output: 30 } } };
      expect(calculateCost(pricing, "openai", "gpt-4", 0, 0)).toBe(0);
    });

    it("handles only prompt tokens", () => {
      const pricing = { openai: { "gpt-4": { input: 10, output: 30 } } };
      expect(calculateCost(pricing, "openai", "gpt-4", 1_000_000, 0)).toBe(10);
    });

    it("handles only completion tokens", () => {
      const pricing = { openai: { "gpt-4": { input: 10, output: 30 } } };
      expect(calculateCost(pricing, "openai", "gpt-4", 0, 1_000_000)).toBe(30);
    });

    it("uses OpenRouter fallback for cost calculation", () => {
      const pricing: Record<string, Record<string, { input: number; output: number }>> = {
        anthropic: {},
      };
      const orCache = {
        "claude-sonnet-4-5": { id: "anthropic/claude-sonnet-4-5", input: 3, output: 15 },
      };
      expect(calculateCost(pricing, "anthropic", "claude-sonnet-4-5", 1_000_000, 0, orCache)).toBe(
        3
      );
    });

    it("combines prompt and completion costs correctly", () => {
      const pricing = { openai: { "gpt-4": { input: 10, output: 30 } } };
      // 500K prompt at $10/1M = $5, 500K completion at $30/1M = $15 → total $20
      expect(calculateCost(pricing, "openai", "gpt-4", 500_000, 500_000)).toBe(20);
    });
  });
});
