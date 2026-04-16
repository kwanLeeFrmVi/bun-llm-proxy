// Unit tests for combo routing strategies
import { describe, it, expect, beforeEach } from "bun:test";
import { sseErrorResponse } from "../../ai-bridge/utils/error.ts";

// Mock TTFT data with insertion order for stable sorting
let insertionCounter = 0;
const mockComboLatency: Array<{
  combo_name: string;
  model: string;
  ttft_ms: number;
  timestamp: string;
  insertOrder: number;
}> = [];

// Mock implementations
async function mockGetAverageTTFT(
  comboName: string,
  model: string,
  sampleCount = 10
): Promise<number | null> {
  const samples = mockComboLatency
    .filter((l) => l.combo_name === comboName && l.model === model)
    .sort((a, b) => {
      // First by timestamp descending, then by insertion order for stable sorting
      const timeDiff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      if (timeDiff !== 0) return timeDiff;
      return b.insertOrder - a.insertOrder; // Higher insertOrder = more recent
    })
    .slice(0, sampleCount);

  if (samples.length === 0) return null;
  const sum = samples.reduce((s, l) => s + l.ttft_ms, 0);
  return sum / samples.length;
}

async function mockRecordComboTTFT(comboName: string, model: string, ttftMs: number) {
  mockComboLatency.push({
    combo_name: comboName,
    model,
    ttft_ms: ttftMs,
    timestamp: new Date().toISOString(),
    insertOrder: insertionCounter++,
  });
  // Auto-prune to 50 samples per (combo, model)
  const samples = mockComboLatency.filter((l) => l.combo_name === comboName && l.model === model);
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

// Import the routing logic from the extracted module
const { handleComboModel, resetAllComboState } = await import("../../services/comboRouting.ts");

describe("Combo Routing Strategies", () => {
  beforeEach(() => {
    // Clear mocks and state
    mockComboLatency.length = 0;
    insertionCounter = 0;
    resetAllComboState();
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
        settings: { stickyRoundRobinLimit: 1 },
      });

      // Second request
      await handleComboModel({
        body: {},
        models,
        handleSingleModel: mockHandleSingle,
        log: { info: () => {}, warn: () => {} },
        comboName: "test-combo",
        comboStrategy: "round-robin",
        settings: { stickyRoundRobinLimit: 1 },
      });

      // Third request
      await handleComboModel({
        body: {},
        models,
        handleSingleModel: mockHandleSingle,
        log: { info: () => {}, warn: () => {} },
        comboName: "test-combo",
        comboStrategy: "round-robin",
        settings: { stickyRoundRobinLimit: 1 },
      });

      // Fourth request - should wrap around
      await handleComboModel({
        body: {},
        models,
        handleSingleModel: mockHandleSingle,
        log: { info: () => {}, warn: () => {} },
        comboName: "test-combo",
        comboStrategy: "round-robin",
        settings: { stickyRoundRobinLimit: 1 },
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

    it("should fallback to next model when selected model fails", async () => {
      const models = [
        { model: "model-a", weight: 1 },
        { model: "model-b", weight: 1 },
        { model: "model-c", weight: 1 },
      ];

      let callOrder: string[] = [];
      const mockHandleSingle = async (_body: unknown, model: string) => {
        callOrder.push(model);
        if (model === "model-a") {
          return new Response(JSON.stringify({ error: "failed" }), { status: 500 });
        }
        return new Response(JSON.stringify({ result: "success" }), { status: 200 });
      };

      const result = await handleComboModel({
        body: {},
        models,
        handleSingleModel: mockHandleSingle,
        log: { info: () => {}, warn: () => {} },
        comboName: "test-combo",
        comboStrategy: "round-robin",
        settings: {},
      });

      expect(callOrder[0]).toBe("model-a");
      expect(callOrder.length).toBeGreaterThan(1);
      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
    });

    it("should return 503 when all models fail in round-robin", async () => {
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
        comboStrategy: "round-robin",
        settings: {},
      });

      expect(result.status).toBe(503);
    });

    it("should fallback when selected model throws an exception", async () => {
      const models = [
        { model: "model-a", weight: 1 },
        { model: "model-b", weight: 1 },
      ];

      let callOrder: string[] = [];
      const mockHandleSingle = async (_body: unknown, model: string) => {
        callOrder.push(model);
        if (model === "model-a") throw new Error("connection refused");
        return new Response(JSON.stringify({ result: "success" }), { status: 200 });
      };

      const result = await handleComboModel({
        body: {},
        models,
        handleSingleModel: mockHandleSingle,
        log: { info: () => {}, warn: () => {} },
        comboName: "test-combo",
        comboStrategy: "round-robin",
        settings: {},
      });

      expect(callOrder).toEqual(["model-a", "model-b"]);
      expect(result.ok).toBe(true);
    });
  });

  describe("weight strategy", () => {
    it("should select models based on weight probability", async () => {
      const models = [
        { model: "model-a", weight: 3 },
        { model: "model-b", weight: 1 },
      ];

      const callCounts: Record<string, number> = { "model-a": 0, "model-b": 0 };
      const mockHandleSingle = async (_body: unknown, model: string) => {
        callCounts[model]++;
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
        // First call fails, second call succeeds
        if (callOrder.length === 1) {
          return new Response(JSON.stringify({ error: "failed" }), { status: 500 });
        }
        return new Response(JSON.stringify({ result: "success" }), { status: 200 });
      };

      const result = await handleComboModel({
        body: {},
        models,
        handleSingleModel: mockHandleSingle,
        log: { info: () => {}, warn: () => {} },
        comboName: "test-combo",
        comboStrategy: "weight",
        settings: {},
      });

      // Should try selected model first (fails), then fallback to remaining in order
      expect(callOrder.length).toBeGreaterThan(1);
      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
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
        getAverageTTFT: mockGetAverageTTFT,
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
          getAverageTTFT: mockGetAverageTTFT,
        });
      }

      expect(callOrder[0]).toBe("fast-model");
      expect(callOrder[1]).toBe("fast-model");
      expect(callOrder[2]).toBe("fast-model");
      // After 3, it re-evaluates (still fast-model in this case)
      expect(callOrder[3]).toBe("fast-model");
      expect(callOrder[4]).toBe("fast-model");
    });

    it("should fall back to first model when no latency data exists", async () => {
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
        getAverageTTFT: mockGetAverageTTFT,
      });

      // Should pick first model when no data
      expect(selectedModel).toBe("model-a");
    });

    it("should fallback to next fastest model when fastest fails", async () => {
      const models = [
        { model: "fast-model", weight: 1 },
        { model: "slow-model", weight: 1 },
      ];

      // Record latency samples
      for (let i = 0; i < 10; i++) {
        await mockRecordComboTTFT("test-combo", "fast-model", 100);
        await mockRecordComboTTFT("test-combo", "slow-model", 500);
      }

      let callOrder: string[] = [];
      const mockHandleSingle = async (_body: unknown, model: string) => {
        callOrder.push(model);
        if (model === "fast-model") {
          return new Response(JSON.stringify({ error: "failed" }), { status: 500 });
        }
        return new Response(JSON.stringify({ result: "success" }), { status: 200 });
      };

      const result = await handleComboModel({
        body: {},
        models,
        handleSingleModel: mockHandleSingle,
        log: { info: () => {}, warn: () => {} },
        comboName: "test-combo",
        comboStrategy: "speed",
        settings: {},
        getAverageTTFT: mockGetAverageTTFT,
      });

      expect(callOrder).toEqual(["fast-model", "slow-model"]);
      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
    });

    it("should return 503 when all models fail in speed strategy", async () => {
      const models = [
        { model: "fast-model", weight: 1 },
        { model: "slow-model", weight: 1 },
      ];

      for (let i = 0; i < 5; i++) {
        await mockRecordComboTTFT("test-combo", "fast-model", 100);
        await mockRecordComboTTFT("test-combo", "slow-model", 500);
      }

      const mockHandleSingle = async (_body: unknown, _model: string) => {
        return new Response(JSON.stringify({ error: "failed" }), { status: 500 });
      };

      const result = await handleComboModel({
        body: {},
        models,
        handleSingleModel: mockHandleSingle,
        log: { info: () => {}, warn: () => {} },
        comboName: "test-combo",
        comboStrategy: "speed",
        settings: {},
        getAverageTTFT: mockGetAverageTTFT,
      });

      expect(result.status).toBe(503);
    });

    it("should fallback when fastest model throws an exception", async () => {
      const models = [
        { model: "fast-model", weight: 1 },
        { model: "slow-model", weight: 1 },
      ];

      for (let i = 0; i < 5; i++) {
        await mockRecordComboTTFT("test-combo", "fast-model", 100);
        await mockRecordComboTTFT("test-combo", "slow-model", 500);
      }

      let callOrder: string[] = [];
      const mockHandleSingle = async (_body: unknown, model: string) => {
        callOrder.push(model);
        if (model === "fast-model") throw new Error("connection refused");
        return new Response(JSON.stringify({ result: "success" }), { status: 200 });
      };

      const result = await handleComboModel({
        body: {},
        models,
        handleSingleModel: mockHandleSingle,
        log: { info: () => {}, warn: () => {} },
        comboName: "test-combo",
        comboStrategy: "speed",
        settings: {},
        getAverageTTFT: mockGetAverageTTFT,
      });

      expect(callOrder).toEqual(["fast-model", "slow-model"]);
      expect(result.ok).toBe(true);
    });
  });

  describe("session-sticky strategy", () => {
    it("should stick the same session to the same model", async () => {
      const models = [
        { model: "model-a", weight: 1 },
        { model: "model-b", weight: 1 },
      ];

      let assignedModel: string | null = null;
      const mockHandleSingle = async (_body: unknown, model: string) => {
        assignedModel = model;
        return new Response(JSON.stringify({ result: "success" }), { status: 200 });
      };

      for (let i = 0; i < 3; i++) {
        await handleComboModel({
          body: {},
          models,
          handleSingleModel: mockHandleSingle,
          log: { info: () => {}, warn: () => {} },
          comboName: "test-combo",
          comboStrategy: "session-sticky",
          settings: {},
          sessionId: "sess-1",
        });
      }

      // All 3 requests should have been assigned to the same model
      expect(assignedModel).toBe("model-a"); // first model assigned to first session
    });

    it("should assign different sessions to different models round-robin", async () => {
      const models = [
        { model: "model-a", weight: 1 },
        { model: "model-b", weight: 1 },
      ];

      const assignments: string[] = [];
      const mockHandleSingle = async (_body: unknown, model: string) => {
        assignments.push(model);
        return new Response(JSON.stringify({ result: "success" }), { status: 200 });
      };

      await handleComboModel({
        body: {},
        models,
        handleSingleModel: mockHandleSingle,
        log: { info: () => {}, warn: () => {} },
        comboName: "test-combo",
        comboStrategy: "session-sticky",
        settings: {},
        sessionId: "sess-1",
      });

      await handleComboModel({
        body: {},
        models,
        handleSingleModel: mockHandleSingle,
        log: { info: () => {}, warn: () => {} },
        comboName: "test-combo",
        comboStrategy: "session-sticky",
        settings: {},
        sessionId: "sess-2",
      });

      await handleComboModel({
        body: {},
        models,
        handleSingleModel: mockHandleSingle,
        log: { info: () => {}, warn: () => {} },
        comboName: "test-combo",
        comboStrategy: "session-sticky",
        settings: {},
        sessionId: "sess-3",
      });

      // Two models, 3 sessions: first two get a/b, third wraps back to a
      expect(assignments).toEqual(["model-a", "model-b", "model-a"]);
    });

    it("should fallback to remaining models when assigned model fails", async () => {
      const models = [
        { model: "model-a", weight: 1 },
        { model: "model-b", weight: 1 },
      ];

      const callOrder: string[] = [];
      const mockHandleSingle = async (_body: unknown, model: string) => {
        callOrder.push(model);
        if (model === "model-a") {
          return new Response(JSON.stringify({ error: "server error" }), { status: 500 });
        }
        return new Response(JSON.stringify({ result: "success" }), { status: 200 });
      };

      const result = await handleComboModel({
        body: {},
        models,
        handleSingleModel: mockHandleSingle,
        log: { info: () => {}, warn: () => {} },
        comboName: "test-combo",
        comboStrategy: "session-sticky",
        settings: {},
        sessionId: "sess-1",
      });

      // Session sess-1 was assigned to model-a (first session), but it fails
      expect(callOrder[0]).toBe("model-a");
      // Fallback should try model-b
      expect(callOrder).toContain("model-b");
      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
    });

    it("should NOT reassign session when assigned model fails — sticks to same model on retry", async () => {
      const models = [
        { model: "model-a", weight: 1 },
        { model: "model-b", weight: 1 },
      ];

      const callOrder: string[] = [];
      const mockHandleSingle = async (_body: unknown, model: string) => {
        callOrder.push(model);
        return new Response(JSON.stringify({ result: "success" }), { status: 200 });
      };

      // First call: sess-1 assigned to model-a, succeeds
      await handleComboModel({
        body: {},
        models,
        handleSingleModel: mockHandleSingle,
        log: { info: () => {}, warn: () => {} },
        comboName: "test-combo",
        comboStrategy: "session-sticky",
        settings: {},
        sessionId: "sess-1",
      });

      // Second call: sess-1 should still be stuck to model-a
      await handleComboModel({
        body: {},
        models,
        handleSingleModel: mockHandleSingle,
        log: { info: () => {}, warn: () => {} },
        comboName: "test-combo",
        comboStrategy: "session-sticky",
        settings: {},
        sessionId: "sess-1",
      });

      // Both calls should go to model-a (not model-b)
      expect(callOrder[0]).toBe("model-a");
      expect(callOrder[1]).toBe("model-a");
    });

    it("should return 503 when all models fail", async () => {
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
        comboStrategy: "session-sticky",
        settings: {},
        sessionId: "sess-1",
      });

      expect(result.status).toBe(503);
    });

    it("should fall back to round-robin when no sessionId is provided", async () => {
      const models = [
        { model: "model-a", weight: 1 },
        { model: "model-b", weight: 1 },
      ];

      const callOrder: string[] = [];
      const mockHandleSingle = async (_body: unknown, model: string) => {
        callOrder.push(model);
        return new Response(JSON.stringify({ result: "success" }), { status: 200 });
      };

      await handleComboModel({
        body: {},
        models,
        handleSingleModel: mockHandleSingle,
        log: { info: () => {}, warn: () => {} },
        comboName: "test-combo",
        comboStrategy: "session-sticky",
        settings: { stickyRoundRobinLimit: 1 },
        sessionId: null, // no session ID
      });

      await handleComboModel({
        body: {},
        models,
        handleSingleModel: mockHandleSingle,
        log: { info: () => {}, warn: () => {} },
        comboName: "test-combo",
        comboStrategy: "session-sticky",
        settings: { stickyRoundRobinLimit: 1 },
        sessionId: null,
      });

      // Without session ID, it falls back to round-robin with sticky limit 1
      expect(callOrder).toEqual(["model-a", "model-b"]);
    });

    it("should return 503 when all models throw exceptions", async () => {
      const models = [
        { model: "model-a", weight: 1 },
        { model: "model-b", weight: 1 },
      ];

      const mockHandleSingle = async (_body: unknown, _model: string) => {
        throw new Error("connection refused");
      };

      const result = await handleComboModel({
        body: {},
        models,
        handleSingleModel: mockHandleSingle,
        log: { info: () => {}, warn: () => {} },
        comboName: "test-combo",
        comboStrategy: "session-sticky",
        settings: {},
        sessionId: "sess-1",
      });

      expect(result.status).toBe(503);
    });
  });
});

describe("Combo TTFT Functions", () => {
  beforeEach(() => {
    mockComboLatency.length = 0;
    insertionCounter = 0;
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
        (l) => l.combo_name === "test-combo" && l.model === "model-a"
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

// ─── readComboError tests (tested via combo weight fallback behavior) ──────────

describe("readComboError via combo fallback", () => {
  beforeEach(() => {
    resetAllComboState();
  });

  it("should extract error message from SSE error response (Claude format)", async () => {
    const models = [
      { model: "model-a", weight: 10 },
      { model: "model-b", weight: 1 },
    ];

    // model-a returns an SSE error response (simulating handleSingleModelChat's sseErrorResponse)
    let callOrder: string[] = [];
    const mockHandleSingle = async (_body: unknown, model: string) => {
      callOrder.push(model);
      if (model === "model-a") {
        return sseErrorResponse(502, "unable to verify the first certificate");
      }
      return new Response(JSON.stringify({ result: "success" }), { status: 200 });
    };

    const result = await handleComboModel({
      body: {},
      models,
      handleSingleModel: mockHandleSingle,
      log: { info: () => {}, warn: () => {} },
      comboName: "test-sse-error",
      comboStrategy: "weight",
      settings: {},
    });

    // model-a should be detected as failed (via X-Proxy-Error header)
    // model-b should succeed
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
  });

  it("should extract error from SSE error response when all models fail", async () => {
    const models = [
      { model: "model-a", weight: 1 },
      { model: "model-b", weight: 1 },
    ];

    const mockHandleSingle = async (_body: unknown, _model: string) => {
      return sseErrorResponse(503, "All accounts unavailable");
    };

    const result = await handleComboModel({
      body: {},
      models,
      handleSingleModel: mockHandleSingle,
      log: { info: () => {}, warn: () => {} },
      comboName: "test-sse-all-fail",
      comboStrategy: "weight",
      settings: {},
    });

    // Should return 503 (all-failed response)
    expect(result.status).toBe(503);
    const body = await result.text();
    const parsed = JSON.parse(body);
    // The error message should contain the extracted SSE error text, NOT "returned status 200"
    expect(parsed.error.message).toContain("All accounts unavailable");
  });

  it("should extract error from standard JSON error response", async () => {
    const models = [
      { model: "model-a", weight: 1 },
      { model: "model-b", weight: 1 },
    ];

    const mockHandleSingle = async (_body: unknown, _model: string) => {
      return new Response(
        JSON.stringify({ error: { message: "Rate limited", type: "rate_limit_error" } }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    };

    const result = await handleComboModel({
      body: {},
      models,
      handleSingleModel: mockHandleSingle,
      log: { info: () => {}, warn: () => {} },
      comboName: "test-json-error",
      comboStrategy: "weight",
      settings: {},
    });

    expect(result.status).toBe(503);
    const body = await result.text();
    const parsed = JSON.parse(body);
    expect(parsed.error.message).toContain("Rate limited");
  });

  it("should handle SSE error with unreadable body gracefully", async () => {
    const models = [
      { model: "model-a", weight: 1 },
    ];

    // Return a response with X-Proxy-Error header but empty body
    const mockHandleSingle = async (_body: unknown, _model: string) => {
      return new Response("", {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "X-Proxy-Error": "503",
        },
      });
    };

    const result = await handleComboModel({
      body: {},
      models,
      handleSingleModel: mockHandleSingle,
      log: { info: () => {}, warn: () => {} },
      comboName: "test-empty-sse",
      comboStrategy: "weight",
      settings: {},
    });

    expect(result.status).toBe(503);
    const body = await result.text();
    const parsed = JSON.parse(body);
    // Should contain "[Proxy Error 503]" fallback, NOT "returned status 200"
    expect(parsed.error.message).toContain("[Proxy Error 503]");
    expect(parsed.error.message).not.toContain("returned status 200");
  });
});
