import { describe, it, expect, mock, spyOn, beforeAll, beforeEach, afterAll } from "bun:test";
import * as usageDb from "../../stubs/usageDb.ts";
// Capture originals of every module this suite replaces with mock.module,
// so we can restore them in afterAll. Without this, Bun's mock.module
// replacements persist for the process lifetime and pollute other test
// files that import the same modules (e.g. ai-bridge-chat-core.test.ts).
import * as authOriginal from "../../services/auth.ts";
import * as modelOriginal from "../../services/model.ts";
import * as authMiddlewareOriginal from "../../lib/authMiddleware.ts";
import * as tokenRefreshOriginal from "../../services/tokenRefresh.ts";
import * as chatCoreOriginal from "../../ai-bridge/handlers/chatCore.ts";
import { handleChat } from "../../handlers/chat.ts";

const MOCKED_MODULE_PATHS = [
  "../../services/auth.ts",
  "../../services/model.ts",
  "../../lib/authMiddleware.ts",
  "../../services/tokenRefresh.ts",
  "../../ai-bridge/handlers/chatCore.ts",
] as const;

const ORIGINALS: Record<(typeof MOCKED_MODULE_PATHS)[number], unknown> = {
  "../../services/auth.ts": { ...authOriginal },
  "../../services/model.ts": { ...modelOriginal },
  "../../lib/authMiddleware.ts": { ...authMiddlewareOriginal },
  "../../services/tokenRefresh.ts": { ...tokenRefreshOriginal },
  "../../ai-bridge/handlers/chatCore.ts": { ...chatCoreOriginal },
};

describe("handleChat usage recording", () => {
  beforeAll(() => {
    // Sanity: ensure we captured the originals before any mock.module call.
    for (const p of MOCKED_MODULE_PATHS) {
      if (!ORIGINALS[p]) throw new Error(`Missing original for ${p}`);
    }
  });

  afterAll(() => {
    // Restore original module exports so subsequent test files see the real
    // implementations. mock.module() has no first-class "unmock", but
    // re-registering with the captured originals achieves the same effect.
    for (const p of MOCKED_MODULE_PATHS) {
      mock.module(p, () => ORIGINALS[p]);
    }
    mock.restore();
  });

  beforeEach(() => {
    mock.restore();
    // Default mocks to prevent real DB/API calls
    mock.module("../../services/auth.ts", () => ({
      getProviderCredentials: () =>
        Promise.resolve({
          connectionId: "conn-1",
          connectionName: "Test Account",
          accessToken: "at",
        }),
      clearAccountError: () => Promise.resolve(),
    }));
    mock.module("../../services/model.ts", () => ({
      getModelInfo: () => Promise.resolve({ provider: "openai", model: "gpt-4" }),
      getFilteredComboModelConfigs: () => Promise.resolve(null),
    }));
    mock.module("../../lib/authMiddleware.ts", () => ({
      checkAuth: () => Promise.resolve({ ok: true, apiKey: "key", apiKeyId: "id" }),
    }));
    mock.module("../../services/tokenRefresh.ts", () => ({
      checkAndRefreshToken: (p: string, c: any) => Promise.resolve(c),
      updateProviderCredentials: () => Promise.resolve(),
    }));
  });

  it("should record usage EXACTLY ONCE for non-streaming requests", async () => {
    const saveUsageSpy = spyOn(usageDb, "saveRequestUsage");

    mock.module("../../ai-bridge/handlers/chatCore.ts", () => ({
      handleChatCore: async (opts: any) => {
        // Simulate non-streaming success
        await opts.onUsage({ prompt_tokens: 10, completion_tokens: 20 });
        return {
          success: true,
          response: new Response(
            JSON.stringify({ usage: { prompt_tokens: 10, completion_tokens: 20 } })
          ),
        };
      },
    }));

    const req = new Request("http://localhost/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({ model: "openai/gpt-4", messages: [] }),
    });

    await handleChat(req);

    // Should be called once by onUsage callback
    expect(saveUsageSpy).toHaveBeenCalledTimes(1);
    const usage = saveUsageSpy.mock.calls[0][1];
    expect(usage.prompt_tokens).toBe(10);
  });

  it("should record usage EXACTLY ONCE for streaming requests via stream wrapper", async () => {
    const saveUsageSpy = spyOn(usageDb, "saveRequestUsage");

    mock.module("../../ai-bridge/handlers/chatCore.ts", () => ({
      handleChatCore: async (opts: any) => {
        // In streaming mode, chatCore DOES NOT call onUsage (it's handled by the wrapper)
        const usageData = { usage: { prompt_tokens: 50, completion_tokens: 100 } };
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(usageData)}\n\n`));
            controller.close();
          },
        });
        return {
          success: true,
          response: new Response(stream),
        };
      },
    }));

    const req = new Request("http://localhost/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({ model: "openai/gpt-4", messages: [], stream: true }),
    });

    const resp = await handleChat(req);
    await resp.body?.getReader().read(); // consume stream to trigger settlement

    // Wait a bit for the async saveRequestUsage in streamWrapper's finally block
    await Bun.sleep(50);

    // Should be called once by streamWrapper, NOT by onUsage callback
    expect(saveUsageSpy).toHaveBeenCalledTimes(1);
    const usage = saveUsageSpy.mock.calls[0][1];
    expect(usage.prompt_tokens).toBe(50);
  });
});
