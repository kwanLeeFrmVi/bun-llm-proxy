import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { setDb, resetConnection } from "../../db/connection.ts";
import { trackPendingRequest, appendRequestLog } from "../../stubs/usageDb.ts";

let testDb: Database;

describe("usageDb.ts", () => {
  beforeEach(() => {
    testDb = new Database(":memory:");
    testDb.run(`
      CREATE TABLE IF NOT EXISTS usage_log (
        id TEXT PRIMARY KEY,
        timestamp TEXT,
        endpoint TEXT,
        provider TEXT,
        model TEXT,
        connection_id TEXT,
        api_key_id TEXT,
        status TEXT DEFAULT 'pending',
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        reasoning_tokens INTEGER DEFAULT 0,
        cached_tokens INTEGER DEFAULT 0,
        cost REAL DEFAULT 0,
        duration_ms INTEGER DEFAULT 0,
        streaming INTEGER DEFAULT 0,
        ttft_ms INTEGER,
        tokens_per_second REAL
      )
    `);
    testDb.run(`
      CREATE TABLE IF NOT EXISTS pricing (
        provider TEXT,
        model TEXT,
        input REAL,
        output REAL
      )
    `);
    // Point the DB singleton at our in-memory DB so stubs/usageDb.ts writes go there
    setDb(testDb);
  });

  afterEach(() => {
    resetConnection();
  });

  it("trackPendingRequest inserts a row and appendRequestLog updates it", () => {
    const requestId = `req-${Date.now()}-${Math.random()}`;
    trackPendingRequest(requestId, { provider: "openai" });

    let row = testDb.query("SELECT status FROM usage_log WHERE id = ?").get(requestId) as any;
    expect(row?.status).toBe("pending");

    appendRequestLog(requestId, "error");

    row = testDb.query("SELECT status FROM usage_log WHERE id = ?").get(requestId) as any;
    expect(row?.status).toBe("error");
  });

  it("handles non-existent requestIds without throwing", () => {
    expect(() => {
      appendRequestLog("non-existent-req", "failed");
    }).not.toThrow();
  });
});
