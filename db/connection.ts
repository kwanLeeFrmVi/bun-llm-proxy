/**
 * Minimal database connection singleton
 * Used by both db/index.ts and stubs/usageDb.ts to avoid circular dependencies
 */

import { Database } from "bun:sqlite";
import { join } from "node:path";
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";

let _db: Database | null = null;

/**
 * Get the raw SQLite database connection without any schema setup
 * This is used by stubs/usageDb.ts which needs to avoid importing from db/index.ts
 * due to circular dependencies with services/pricingSync.ts
 */
export function getRawDb(): Database {
  if (_db) return _db;

  const dataDir = process.env.DATA_DIR ?? join(homedir(), ".bunLLM");
  mkdirSync(dataDir, { recursive: true });
  const dbPath = join(dataDir, "router.db");

  // Open with busy_timeout in the constructor options so SQLite waits for locks
  // instead of failing immediately with SQLITE_BUSY on PM2 restarts.
  _db = new Database(dbPath, { create: true, strict: false });
  _db.run("PRAGMA journal_mode = WAL;");
  _db.run("PRAGMA synchronous = NORMAL;");
  _db.run("PRAGMA busy_timeout = 10000;");
  // Run a WAL checkpoint to clean up any leftover WAL/SHM files from a
  // previous process that didn't shut down cleanly (e.g. PM2 kill).
  try { _db.run("PRAGMA wal_checkpoint(TRUNCATE);"); } catch { /* ignore if WAL not active */ }

  return _db;
}

/**
 * Set the database instance (used by db/index.ts after running migrations)
 */
export function setDb(db: Database): void {
  _db = db;
}

/**
 * Reset the database connection for testing.
 */
export function resetConnection(): void {
  _db = null;
}
