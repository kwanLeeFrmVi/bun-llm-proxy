import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";

describe("chatCron", () => {
  let originalBunCronParse: typeof Bun.cron.parse;

  beforeEach(() => {
    originalBunCronParse = Bun.cron.parse;

    // Mock Bun.cron.parse to return a near-future date
    Bun.cron.parse = mock(() => {
      const next = new Date(Date.now() + 100);
      return next;
    });

    // Mock logger to avoid console noise
    mock.module("../../../lib/logger.ts", () => ({
      info: mock(() => {}),
      debug: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
    }));
  });

  afterEach(() => {
    const { stopChatCron } = require("../../../services/chatCron.ts");
    stopChatCron();
    Bun.cron.parse = originalBunCronParse;
  });

  it("should start cron without errors", () => {
    const { startChatCron } = require("../../../services/chatCron.ts");
    expect(() => startChatCron()).not.toThrow();
  });

  it("should not throw when starting twice", () => {
    const { startChatCron } = require("../../../services/chatCron.ts");
    startChatCron();
    expect(() => startChatCron()).not.toThrow();
  });

  it("should stop cron without errors", () => {
    const { startChatCron, stopChatCron } = require("../../../services/chatCron.ts");
    startChatCron();
    expect(() => stopChatCron()).not.toThrow();
  });

  it("should handle parse failure gracefully", () => {
    Bun.cron.parse = mock(() => null);
    const { startChatCron } = require("../../../services/chatCron.ts");
    expect(() => startChatCron()).not.toThrow();
  });

  it("should call runSingleModel with correct parameters", async () => {
    let capturedArgs: any = null;
    const mockRunSingleModel = (args: any) => {
      capturedArgs = args;
      return Promise.resolve(new Response('{"id":"test"}', { status: 200 }));
    };

    mock.module("../../../handlers/chat/singleModelPipeline.ts", () => ({
      runSingleModel: mockRunSingleModel,
    }));

    // Clear require cache to get fresh module with mocks
    const modulePath = "../../../services/chatCron.ts";
    delete require.cache[require.resolve(modulePath)];

    const { _doChatCronJob } = require(modulePath);

    await _doChatCronJob();

    expect(capturedArgs).toBeDefined();
    expect(capturedArgs.modelStr).toBe("troll/claude-sonnet-4-6");
    expect(capturedArgs.body).toEqual({
      model: "troll/claude-sonnet-4-6",
      messages: [{ role: "user", content: "ey say nothing" }],
      stream: false,
      max_tokens: 1024,
    });
    expect(capturedArgs.apiKey).toBeNull();
    expect(capturedArgs.apiKeyId).toBeNull();
    expect(capturedArgs.skipComboCheck).toBe(true);
  });
});
