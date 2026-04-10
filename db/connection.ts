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

  _db = new Database(dbPath, { create: true });
  _db.run("PRAGMA journal_mode = WAL;");
  _db.run("PRAGMA synchronous = NORMAL;");
  _db.run("PRAGMA busy_timeout = 5000;");

  return _db;
}

/**
 * Set the database instance (used by db/index.ts after running migrations)
 */
export function setDb(db: Database): void {
  _db = db;
}
