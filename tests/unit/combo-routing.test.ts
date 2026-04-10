// Unit tests for combo routing strategies
import { describe, it, expect, beforeEach, afterEach } from "bun:test";

// Mock the database functions
const mockComboConfigs: Record<string, { name: string; models: Array<{ model: string; weight: number }> }> = {};
const mockComboLatency: Array<{ combo_name: string; model: string; ttft_ms: number; timestamp: string }> = [];

// Mock implementations
async function mockGetComboConfig(name: string) {
  return mockComboConfigs[name] ?? null;
}

async function mockSetComboConfig(name: string, config: { name: string; models: Array<{ model: string; weight: number }> }) {
  mockComboConfigs[name] = config;
}

async function mockRecordComboTTFT(comboName: string, model: string, ttftMs: number) {
  mockComboLatency.push({
    combo_name: comboName,
    model,
    ttft_ms: ttftMs,
    timestamp: new Date().toISOString(),
  });
  // Auto-prune to 50 samples per (combo, model)
  const samples = mockComboLatency.filter(l => l.combo_name === comboName && l.model === model);
  if (samples.length > 50) {
    const toRemove = samples.length - 50;
    let removed = 0;
    for (let i = 0; i < mockComboLatency.length && removed < toRemove; i++) {
      if (mockComboLatency[i]!.combo_name === comboName && mockComboLatency[i]!.model === model) {
        mockComboLatency.splice(i, 1);
        i--;
        removed++;
      }
    }
  }
}

async function mockGetAverageTTFT(comboName: string, model: string, sampleCount = 10): Promise<number | null> {
  const samples = mockComboLatency
    .filter(l => l.combo_name === comboName && l.model === model)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, sampleCount);

  if (samples.length === 0) return null;
  const sum = samples.reduce((s, l) => s + l.ttft_ms, 0);
  return sum / samples.length;
}

// Import and test the routing logic
const { handleComboModel } = await import("../../handlers/chat.ts");

describe("Combo Routing Strategies", () => {
  beforeEach(() => {
    // Clear mocks
    Object.keys(mockComboConfigs).forEach(key => delete mockComboConfigs[key]);
    mockComboLatency.length = 0;
  });

  describe("fallback strategy", () => {
    it("should try models in order and return first success", async () => {
      const models = [
        { model: "model-a", weight: 1 },
        { model: "model-b", weight: 1 },
        { model: "model-c", weight: 1 },
      ];

      let callOrder: string[] = [];
      const mockHandleSingle = async (_body: unknown, model: string) => {
        callOrder.push(model);
        if (model === "model-b") {
          return new Response(JSON.stringify({ result: "success" }), { status: 200 });
        }
        return new Response(JSON.stringify({ error: "failed" }), { status: 500 });
      };

      const result = await handleComboModel({
        body: {},
        models,
        handleSingleModel: mockHandleSingle,
        log: { info: () => {}, warn: () => {} },
        comboName: "test-combo",
        comboStrategy: "fallback",
        settings: {},
      });

      expect(callOrder).toEqual(["model-a", "model-b"]);
      expect(result.status).toBe(200);
    });

    it("should return error if all models fail", async () => {
      const models = [
        { model: "model-a", weight: 1 },
        { model: "model-b", weight: 1 },
      ];

      const mockHandleSingle = async (_body: unknown, _model: string) => {
        return new Response(JSON.stringify({ error: "failed" }), { status: 500 });
      };

      const result = await handleComboModel({
        body: {},
        models,
        handleSingleModel: mockHandleSingle,
        log: { info: () => {}, warn: () => {} },
        comboName: "test-combo",
        comboStrategy: "fallback",
        settings: {},
      });

      expect(result.status).toBe(503);
    });
  });

  describe("round-robin strategy", () => {
    it("should rotate through models in order", async () => {
      const models = [
        { model: "model-a", weight: 1 },
        { model: "model-b", weight: 1 },
        { model: "model-c", weight: 1 },
      ];

      let callOrder: string[] = [];
      const mockHandleSingle = async (_body: unknown, model: string) => {
        callOrder.push(model);
        return new Response(JSON.stringify({ result: "success" }), { status: 200 });
      };

      // First request
      await handleComboModel({
        body: {},
        models,
        handleSingleModel: mockHandleSingle,
        log: { info: () => {}, warn: () => {} },
        comboName: "test-combo",
        comboStrategy: "round-robin",
        settings: {},
      });

      // Second request
      await handleComboModel({
        body: {},
        models,
        handleSingleModel: mockHandleSingle,
        log: { info: () => {}, warn: () => {} },
        comboName: "test-combo",
        comboStrategy: "round-robin",
        settings: {},
      });

      // Third request
      await handleComboModel({
        body: {},
        models,
        handleSingleModel: mockHandleSingle,
        log: { info: () => {}, warn: () => {} },
        comboName: "test-combo",
        comboStrategy: "round-robin",
        settings: {},
      });

      // Fourth request - should wrap around
      await handleComboModel({
        body: {},
        models,
        handleSingleModel: mockHandleSingle,
        log: { info: () => {}, warn: () => {} },
        comboName: "test-combo",
        comboStrategy: "round-robin",
        settings: {},
      });

      expect(callOrder).toEqual(["model-a", "model-b", "model-c", "model-a"]);
    });

    it("should respect sticky limit", async () => {
      const models = [
        { model: "model-a", weight: 1 },
        { model: "model-b", weight: 1 },
      ];

      let callOrder: string[] = [];
      const mockHandleSingle = async (_body: unknown, model: string) => {
        callOrder.push(model);
        return new Response(JSON.stringify({ result: "success" }), { status: 200 });
      };

      const settings = { stickyRoundRobinLimit: 3 };

      // Make 4 requests
      for (let i = 0; i < 4; i++) {
        await handleComboModel({
          body: {},
          models,
          handleSingleModel: mockHandleSingle,
          log: { info: () => {}, warn: () => {} },
          comboName: "test-combo",
          comboStrategy: "round-robin",
          settings,
        });
      }

      expect(callOrder).toEqual(["model-a", "model-a", "model-a", "model-b"]);
    });
  });

  describe("weight strategy", () => {
    it("should select models based on weight probability", async () => {
      const models = [
        { model: "model-a", weight: 3 },
        { model: "model-b", weight: 1 },
      ];

      const callCounts = { "model-a": 0, "model-b": 0 };
      const mockHandleSingle = async (_body: unknown, model: string) => {
        callCounts[model as keyof typeof callCounts]++;
        return new Response(JSON.stringify({ result: "success" }), { status: 200 });
      };

      // Run 100 times to get distribution
      for (let i = 0; i < 100; i++) {
        await handleComboModel({
          body: {},
          models,
          handleSingleModel: mockHandleSingle,
          log: { info: () => {}, warn: () => {} },
          comboName: "test-combo",
          comboStrategy: "weight",
          settings: {},
        });
      }

      // model-a should be selected ~75% of the time (3/4 weight)
      const ratioA = callCounts["model-a"] / 100;
      expect(ratioA).toBeGreaterThan(0.6); // At least 60%
      expect(ratioA).toBeLessThan(0.9); // At most 90%
    });

    it("should fall back sequentially on failure", async () => {
      const models = [
        { model: "model-a", weight: 10 },
        { model: "model-b", weight: 1 },
        { model: "model-c", weight: 1 },
      ];

      let callOrder: string[] = [];
      const mockHandleSingle = async (_body: unknown, model: string) => {
        callOrder.push(model);
        // First selected model fails, try remaining in order
        if (callOrder.length === 1) {
          return new Response(JSON.stringify({ error: "failed" }), { status: 500 });
        }
        return new Response(JSON.stringify({ result: "success" }), { status: 200 });
      };

      await handleComboModel({
        body: {},
        models,
        handleSingleModel: mockHandleSingle,
        log: { info: () => {}, warn: () => {} },
        comboName: "test-combo",
        comboStrategy: "weight",
        settings: {},
      });

      // Should try selected model first, then fallback to remaining
      expect(callOrder.length).toBeGreaterThan(1);
      expect(callOrder[callOrder.length - 1]).toBe("model-b"); // First fallback succeeds
    });
  });

  describe("speed strategy", () => {
    it("should pick model with lowest average TTFT", async () => {
      const models = [
        { model: "fast-model", weight: 1 },
        { model: "slow-model", weight: 1 },
      ];

      // Record latency samples
      for (let i = 0; i < 10; i++) {
        await mockRecordComboTTFT("test-combo", "fast-model", 100);
        await mockRecordComboTTFT("test-combo", "slow-model", 500);
      }

      let selectedModel: string | null = null;
      const mockHandleSingle = async (_body: unknown, model: string) => {
        selectedModel = model;
        return new Response(JSON.stringify({ result: "success" }), { status: 200 });
      };

      await handleComboModel({
        body: {},
        models,
        handleSingleModel: mockHandleSingle,
        log: { info: () => {}, warn: () => {} },
        comboName: "test-combo",
        comboStrategy: "speed",
        settings: {},
      });

      expect(selectedModel).toBe("fast-model");
    });

    it("should stick to fastest model for N requests", async () => {
      const models = [
        { model: "fast-model", weight: 1 },
        { model: "slow-model", weight: 1 },
      ];

      // Record latency samples
      for (let i = 0; i < 5; i++) {
        await mockRecordComboTTFT("test-combo", "fast-model", 100);
        await mockRecordComboTTFT("test-combo", "slow-model", 500);
      }

      const callOrder: string[] = [];
      const mockHandleSingle = async (_body: unknown, model: string) => {
        callOrder.push(model);
        return new Response(JSON.stringify({ result: "success" }), { status: 200 });
      };

      const settings = { stickyRoundRobinLimit: 3 };

      // Make 5 requests - should stick to fast-model for 3, then re-evaluate
      for (let i = 0; i < 5; i++) {
        await handleComboModel({
          body: {},
          models,
          handleSingleModel: mockHandleSingle,
          log: { info: () => {}, warn: () => {} },
          comboName: "test-combo",
          comboStrategy: "speed",
          settings,
        });
      }

      expect(callOrder[0]).toBe("fast-model");
      expect(callOrder[1]).toBe("fast-model");
      expect(callOrder[2]).toBe("fast-model");
      // After 3, it re-evaluates (still fast-model in this case)
      expect(callOrder[3]).toBe("fast-model");
      expect(callOrder[4]).toBe("fast-model");
    });

    it("should fall back to original order when no latency data exists", async () => {
      const models = [
        { model: "model-a", weight: 1 },
        { model: "model-b", weight: 1 },
      ];

      // No latency data recorded

      let selectedModel: string | null = null;
      const mockHandleSingle = async (_body: unknown, model: string) => {
        selectedModel = model;
        return new Response(JSON.stringify({ result: "success" }), { status: 200 });
      };

      await handleComboModel({
        body: {},
        models,
        handleSingleModel: mockHandleSingle,
        log: { info: () => {}, warn: () => {} },
        comboName: "test-combo",
        comboStrategy: "speed",
        settings: {},
      });

      // Should pick first model when no data
      expect(selectedModel).toBe("model-a");
    });
  });
});

describe("Combo Config Functions", () => {
  beforeEach(() => {
    Object.keys(mockComboConfigs).forEach(key => delete mockComboConfigs[key]);
    mockComboLatency.length = 0;
  });

  describe("setComboConfig and getComboConfig", () => {
    it("should store and retrieve combo config", async () => {
      const config = {
        name: "test-combo",
        models: [
          { model: "model-a", weight: 3 },
          { model: "model-b", weight: 1 },
        ],
      };

      await mockSetComboConfig("test-combo", config);
      const retrieved = await mockGetComboConfig("test-combo");

      expect(retrieved).toEqual(config);
    });

    it("should return null for non-existent combo", async () => {
      const retrieved = await mockGetComboConfig("non-existent");
      expect(retrieved).toBeNull();
    });
  });

  describe("recordComboTTFT and getAverageTTFT", () => {
    it("should record TTFT samples", async () => {
      await mockRecordComboTTFT("test-combo", "model-a", 100);
      await mockRecordComboTTFT("test-combo", "model-a", 200);
      await mockRecordComboTTFT("test-combo", "model-a", 300);

      const avg = await mockGetAverageTTFT("test-combo", "model-a");
      expect(avg).toBe(200); // (100 + 200 + 300) / 3
    });

    it("should only average the last N samples", async () => {
      // Record 20 samples
      for (let i = 1; i <= 20; i++) {
        await mockRecordComboTTFT("test-combo", "model-a", i * 10);
      }

      const avg = await mockGetAverageTTFT("test-combo", "model-a", 10);
      // Last 10 samples: 110, 120, 130, 140, 150, 160, 170, 180, 190, 200
      // Average = 155
      expect(avg).toBe(155);
    });

    it("should return null when no samples exist", async () => {
      const avg = await mockGetAverageTTFT("test-combo", "model-a");
      expect(avg).toBeNull();
    });

    it("should prune to 50 samples per combo/model", async () => {
      // Record 100 samples
      for (let i = 0; i < 100; i++) {
        await mockRecordComboTTFT("test-combo", "model-a", i);
      }

      // Check that only 50 samples remain
      const samples = mockComboLatency.filter(
        l => l.combo_name === "test-combo" && l.model === "model-a"
      );
      expect(samples.length).toBe(50);
    });

    it("should handle multiple combos and models independently", async () => {
      await mockRecordComboTTFT("combo1", "model-a", 100);
      await mockRecordComboTTFT("combo1", "model-b", 200);
      await mockRecordComboTTFT("combo2", "model-a", 300);

      const avg1a = await mockGetAverageTTFT("combo1", "model-a");
      const avg1b = await mockGetAverageTTFT("combo1", "model-b");
      const avg2a = await mockGetAverageTTFT("combo2", "model-a");

      expect(avg1a).toBe(100);
      expect(avg1b).toBe(200);
      expect(avg2a).toBe(300);
    });
  });
});
