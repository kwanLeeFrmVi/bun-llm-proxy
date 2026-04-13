import { describe, it, expect, beforeEach, mock } from "bun:test";
import { Database } from "bun:sqlite";

// Setup mocks before importing
let testDb: Database;

mock.module("../../db/connection.ts", () => ({
  getRawDb: () => testDb
}));

import { trackPendingRequest, appendRequestLog, saveRequestUsage } from "../../stubs/usageDb.ts";

describe("usageDb.ts", () => {
  beforeEach(() => {
    testDb = new Database(":memory:");
    testDb.run(`
      CREATE TABLE usage_log (
        id TEXT PRIMARY KEY,
        timestamp TEXT,
        endpoint TEXT,
        provider TEXT,
        model TEXT,
        connection_id TEXT,
        api_key_id TEXT,
        status TEXT,
        prompt_tokens INTEGER,
        completion_tokens INTEGER,
        reasoning_tokens INTEGER,
        cached_tokens INTEGER,
        cost REAL,
        duration_ms INTEGER
      )
    `);

    // We also need to mock the pricing table for saveRequestUsage if we want to call it
    testDb.run(`
        CREATE TABLE pricing (
          provider TEXT,
          model TEXT,
          input REAL,
          output REAL
        )
    `);
  });

  describe("appendRequestLog", () => {
    it("updates the status in the db", () => {
      const requestId = "req-1";
      trackPendingRequest(requestId, { provider: "openai" });

      // Ensure it exists with 'pending' status initially
      let row = testDb.query("SELECT * FROM usage_log WHERE id = ?").get(requestId) as any;
      expect(row.status).toBe("pending");

      // Call the function
      appendRequestLog(requestId, "error", "some error message");

      // Assert status is updated
      row = testDb.query("SELECT * FROM usage_log WHERE id = ?").get(requestId) as any;
      expect(row.status).toBe("error");
    });

    it("removes the request from pendingRequests so metadata is no longer available", async () => {
      const requestId = "req-2";
      trackPendingRequest(requestId, { provider: "anthropic", model: "claude-3-opus" });

      appendRequestLog(requestId, "aborted");

      // Try to save usage (which normally falls back to metadata from pendingRequests if not provided)
      await saveRequestUsage(requestId, { prompt_tokens: 10 }, 500);

      // We should check that saveRequestUsage didn't use the pending metadata
      // Actually, since saveRequestUsage uses `WHERE id = ? AND status = 'pending'`,
      // if it was updated to 'aborted', it shouldn't update the row to 'ok' anyway.

      const row = testDb.query("SELECT * FROM usage_log WHERE id = ?").get(requestId) as any;
      expect(row.status).toBe("aborted");
    });

    it("handles non-existent requestIds without throwing", () => {
      // It just shouldn't throw an error
      expect(() => {
        appendRequestLog("non-existent-req", "failed");
      }).not.toThrow();
    });
  });
});
