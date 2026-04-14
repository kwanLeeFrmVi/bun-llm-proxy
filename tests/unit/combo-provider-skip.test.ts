import { describe, it, expect, mock, beforeEach } from "bun:test";

const mockGetComboByName = mock(() => Promise.resolve(null));
const mockGetComboConfig = mock(() => Promise.resolve(null));
const mockGetProviderConnections = mock(() => Promise.resolve([]));
const mockGetProviderNodes = mock(() => Promise.resolve([]));
const mockGetModelAliases = mock(() => Promise.resolve({}));
const mockParseModel = mock((s: string) => ({
  isAlias: false, provider: s.split("/")[0], providerAlias: s.split("/")[0], model: s.split("/")[1] ?? s,
}));

mock.module("../../db/index.ts", () => ({
  getComboByName: mockGetComboByName, getComboConfig: mockGetComboConfig,
  getProviderConnections: mockGetProviderConnections, getProviderNodes: mockGetProviderNodes,
  getModelAliases: mockGetModelAliases,
}));
mock.module("../../ai-bridge/services/model.ts", () => ({
  parseModel: mockParseModel, resolveModelAliasFromMap: () => null, getModelInfoCore: () => Promise.resolve({ provider: null, model: null }),
}));

import { getFilteredComboModelConfigs } from "../../services/model.ts";

describe("getFilteredComboModelConfigs", () => {
  beforeEach(() => {
    mockGetComboByName.mockImplementation(() => Promise.resolve(null));
    mockGetComboConfig.mockImplementation(() => Promise.resolve(null));
    mockGetProviderConnections.mockImplementation(() => Promise.resolve([]));
    mockGetProviderNodes.mockImplementation(() => Promise.resolve([]));
  });

  it("returns null for model strings containing /", async () => {
    expect(await getFilteredComboModelConfigs("openai/gpt-4o")).toBeNull();
  });

  it("returns null when combo does not exist", async () => {
    expect(await getFilteredComboModelConfigs("no-such-combo")).toBeNull();
  });

  it("filters out models from disabled providers", async () => {
    mockGetComboByName.mockImplementation(async (n: string) =>
      n === "my-combo" ? { id: "1", name: n, models: ["openai/a", "anthropic/b", "gemini/c"] } : null
    );
    mockGetComboConfig.mockImplementation(async (n: string) =>
      n === "my-combo" ? { name: n, models: [{ model: "openai/a", weight: 2 }, { model: "anthropic/b", weight: 1 }, { model: "gemini/c", weight: 1 }] } : null
    );
    mockGetProviderConnections.mockImplementation(async (f: any) =>
      f?.isActive === true ? [{ id: "c1", provider: "openai" }, { id: "c3", provider: "gemini" }] : []
    );

    const result = await getFilteredComboModelConfigs("my-combo");
    expect(result).not.toBeNull();
    expect(result!.length).toBe(2);
    expect(result!.map((m: any) => m.model)).toEqual(["openai/a", "gemini/c"]);
    expect(result![0].weight).toBe(2);
  });

  it("returns null when all providers disabled", async () => {
    mockGetComboByName.mockImplementation(async (n: string) =>
      n === "my-combo" ? { id: "1", name: n, models: ["openai/a", "anthropic/b"] } : null
    );
    mockGetComboConfig.mockImplementation(async (n: string) =>
      n === "my-combo" ? { name: n, models: [{ model: "openai/a", weight: 1 }, { model: "anthropic/b", weight: 1 }] } : null
    );
    mockGetProviderConnections.mockImplementation(async (f: any) => f?.isActive === true ? [] : []);

    expect(await getFilteredComboModelConfigs("my-combo")).toBeNull();
  });

  it("skips nested combos with no available models", async () => {
    mockGetComboByName.mockImplementation(async (n: string) => {
      if (n === "outer") return { id: "1", name: n, models: ["inner", "openai/a"] };
      if (n === "inner") return { id: "2", name: n, models: ["anthropic/b"] };
      return null;
    });
    mockGetComboConfig.mockImplementation(async (n: string) => {
      if (n === "outer") return { name: n, models: [{ model: "inner", weight: 1 }, { model: "openai/a", weight: 1 }] };
      if (n === "inner") return { name: n, models: [{ model: "anthropic/b", weight: 1 }] };
      return null;
    });
    // Only openai active — anthropic (used by inner combo) is disabled
    mockGetProviderConnections.mockImplementation(async (f: any) =>
      f?.isActive === true ? [{ id: "c1", provider: "openai" }] : []
    );

    const result = await getFilteredComboModelConfigs("outer");
    expect(result).not.toBeNull();
    expect(result!.length).toBe(1);
    expect(result![0].model).toBe("openai/a");
  });

  it("keeps nested combos that have available models", async () => {
    mockGetComboByName.mockImplementation(async (n: string) => {
      if (n === "outer") return { id: "1", name: n, models: ["inner", "openai/a"] };
      if (n === "inner") return { id: "2", name: n, models: ["anthropic/b"] };
      return null;
    });
    mockGetComboConfig.mockImplementation(async (n: string) => {
      if (n === "outer") return { name: n, models: [{ model: "inner", weight: 3 }, { model: "openai/a", weight: 1 }] };
      if (n === "inner") return { name: n, models: [{ model: "anthropic/b", weight: 1 }] };
      return null;
    });
    // Both openai and anthropic active
    mockGetProviderConnections.mockImplementation(async (f: any) =>
      f?.isActive === true ? [{ id: "c1", provider: "openai" }, { id: "c2", provider: "anthropic" }] : []
    );

    const result = await getFilteredComboModelConfigs("outer");
    expect(result).not.toBeNull();
    expect(result!.length).toBe(2);
    expect(result!.map((m: any) => m.model)).toEqual(["inner", "openai/a"]);
    expect(result![0].weight).toBe(3);
  });
});
