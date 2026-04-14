import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { RequestContext } from "../../lib/requestContext.ts";
import * as db from "../../db/index.ts";
import * as modelService from "../../services/model.ts";
import { handleChat } from "../../handlers/chat.ts";
import * as authService from "../../services/auth.ts";
import * as chatCore from "../../ai-bridge/handlers/chatCore.ts";

describe("Combo Provider Skip", () => {
  beforeEach(() => {
    // Mock DB functions
    spyOn(db, "getSettings").mockImplementation(async () => ({
      comboStrategy: "fallback",
      comboStrategies: {},
    }));
    
    spyOn(db, "getComboByName").mockImplementation(async (name) => {
      if (name === "test-combo") {
        return {
          id: "1",
          name: "test-combo",
          models: ["provider1/model1", "provider2/model2"],
          created_at: "",
          updated_at: "",
        };
      }
      return null;
    });

    spyOn(db, "getComboConfig").mockImplementation(async (name) => {
      if (name === "test-combo") {
        return {
          name: "test-combo",
          models: [
            { model: "provider1/model1", weight: 1 },
            { model: "provider2/model2", weight: 1 },
          ],
        };
      }
      return null;
    });
  });

  afterEach(() => {
    // Restore mocks
  });

  it("should skip models of a disabled provider in a combo", async () => {
    // provider1 is INACTIVE, provider2 is ACTIVE
    spyOn(db, "getProviderConnections").mockImplementation(async (filter) => {
      if (filter?.isActive === true) {
        return [
          { id: "conn2", provider: "provider2", is_active: true } as any
        ];
      }
      return [
        { id: "conn1", provider: "provider1", is_active: false } as any,
        { id: "conn2", provider: "provider2", is_active: true } as any
      ];
    });

    // Mock chatCore to see which model is tried
    const chatCoreSpy = spyOn(chatCore, "handleChatCore").mockImplementation(async (opts) => {
      return { success: true, response: new Response("ok"), status: 200, error: "" } as any;
    });

    // Mock auth middleware and other dependencies
    const req = new Request("http://localhost/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: "test-combo",
        messages: [{ role: "user", content: "hi" }]
      }),
      headers: { "Authorization": "Bearer test-key" }
    });

    // Mock checkAuth
    const authMiddleware = require("../../lib/authMiddleware.ts");
    spyOn(authMiddleware, "checkAuth").mockImplementation(async () => ({
      ok: true,
      apiKey: "test-key",
      apiKeyId: "test-id"
    }));

    // Mock getProviderCredentials
    spyOn(authService, "getProviderCredentials").mockImplementation(async (provider) => {
      if (provider === "provider2") {
        return { connectionId: "conn2", connectionName: "conn2" } as any;
      }
      return null;
    });

    await handleChat(req);

    // Verify chatCore was called ONLY for provider2/model2, not provider1/model1
    expect(chatCoreSpy).toHaveBeenCalledTimes(1);
    expect(chatCoreSpy.mock.calls[0][0].body.model).toBe("provider2/model2");
  });

  it("should return error when all providers in a combo are disabled", async () => {
    // Both providers are INACTIVE
    spyOn(db, "getProviderConnections").mockImplementation(async (filter) => {
      if (filter?.isActive === true) {
        return [];
      }
      return [
        { id: "conn1", provider: "provider1", is_active: false } as any,
        { id: "conn2", provider: "provider2", is_active: false } as any
      ];
    });

    // Mock chatCore
    spyOn(chatCore, "handleChatCore").mockImplementation(async () => {
      return { success: true, response: new Response("ok"), status: 200, error: "" } as any;
    });

    const req = new Request("http://localhost/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: "test-combo",
        messages: [{ role: "user", content: "hi" }]
      }),
      headers: { "Authorization": "Bearer test-key" }
    });

    const authMiddleware = require("../../lib/authMiddleware.ts");
    spyOn(authMiddleware, "checkAuth").mockImplementation(async () => ({
      ok: true,
      apiKey: "test-key",
      apiKeyId: "test-id"
    }));

    const response = await handleChat(req);
    expect(response.status).toBe(400);
    const result = await response.json();
    expect(result.error).toBe("Invalid model format");
  });
});
