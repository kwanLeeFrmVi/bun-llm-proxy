#!/usr/bin/env bun
/**
 * One-time migration script: Migrate enabled models from connection-specific to provider-level storage
 *
 * Run with: bun run scripts/migrate-enabled-models.ts
 *
 * This script migrates custom models from provider_connections.provider_specific_data.enabledModels
 * to settings table with key pattern "providerEnabledModels:{providerId}"
 */

import { Database } from "bun:sqlite";
import { join } from "node:path";
import { homedir } from "node:os";

function getDatabasePath(): string {
  const dataDir = process.env.DATA_DIR ?? join(homedir(), ".bunLLM");
  return join(dataDir, "router.db");
}

interface ConnectionRow {
  id: string;
  provider_specific_data: string;
}

interface ProviderSpecificData {
  nodeName?: string;
  enabledModels?: unknown;
}

async function main() {
  const dbPath = getDatabasePath();
  console.log(`[Migration] Opening database: ${dbPath}`);

  const db = new Database(dbPath, { create: true, readonly: false });

  try {
    // Check if settings table exists
    const settingsExists = db
      .query<
        { name: string },
        []
      >("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'")
      .get();

    if (!settingsExists) {
      console.error(
        "[Migration] settings table does not exist. Please run the server first to initialize the database."
      );
      process.exit(1);
    }

    // Get all connections with enabledModels in provider_specific_data
    console.log("[Migration] Scanning for connections with enabledModels...");
    const connections = db
      .query<ConnectionRow, []>(
        `SELECT id, provider_specific_data FROM provider_connections
         WHERE provider_specific_data IS NOT NULL
         AND provider_specific_data LIKE '%enabledModels%'`
      )
      .all();

    if (connections.length === 0) {
      console.log("[Migration] No connections with enabledModels found. Nothing to migrate.");
      process.exit(0);
    }

    console.log(`[Migration] Found ${connections.length} connection(s) with enabledModels`);

    // Collect models by provider
    const providerModels = new Map<string, string[]>();

    for (const conn of connections) {
      let psd: ProviderSpecificData;
      try {
        psd = JSON.parse(conn.provider_specific_data) as ProviderSpecificData;
      } catch (e) {
        console.warn(
          `[Migration] Failed to parse provider_specific_data for connection ${conn.id}:`,
          e
        );
        continue;
      }

      const enabledModels = psd.enabledModels;
      const nodeName = typeof psd.nodeName === "string" ? psd.nodeName : null;

      if (!nodeName) {
        console.warn(
          `[Migration] Connection ${conn.id} has enabledModels but no nodeName, skipping.`
        );
        continue;
      }

      if (!Array.isArray(enabledModels) || enabledModels.length === 0) {
        console.warn(
          `[Migration] Connection ${conn.id} (nodeName: ${nodeName}) has empty or invalid enabledModels, skipping.`
        );
        continue;
      }

      // Filter to ensure we have strings only
      const modelIds = enabledModels.filter(
        (m): m is string => typeof m === "string" && m.trim() !== ""
      );

      if (modelIds.length === 0) {
        continue;
      }

      // Merge models for this provider (deduplicate)
      const existing = providerModels.get(nodeName) ?? [];
      const merged = [...new Set([...existing, ...modelIds])];
      providerModels.set(nodeName, merged);

      console.log(
        `[Migration] Found ${modelIds.length} model(s) for provider "${nodeName}":`,
        modelIds
      );
    }

    if (providerModels.size === 0) {
      console.log("[Migration] No valid models to migrate.");
      process.exit(0);
    }

    console.log(`[Migration] Found ${providerModels.size} unique provider(s) with models`);

    // Migrate to settings table
    let migratedCount = 0;
    let skippedCount = 0;

    for (const [nodeName, modelIds] of providerModels.entries()) {
      const key = `providerEnabledModels:${nodeName}`;

      // Check if already exists
      const existing = db
        .query<{ value: string }, [string]>("SELECT value FROM settings WHERE key = ?")
        .get(key);

      if (existing) {
        console.log(
          `[Migration] Provider "${nodeName}" already has provider-level models, skipping.`
        );
        skippedCount++;
        continue;
      }

      // Insert new entry
      db.run("INSERT INTO settings (key, value) VALUES (?, ?)", [key, JSON.stringify(modelIds)]);

      console.log(`[Migration] ✓ Migrated ${modelIds.length} models for provider "${nodeName}"`);
      migratedCount++;
    }

    console.log(
      `\n[Migration] Completed: ${migratedCount} provider(s) migrated, ${skippedCount} skipped.`
    );

    // Show verification query
    console.log(`\n[Migration] To verify, run:`);
    console.log(
      `  sqlite3 ${dbPath} "SELECT key, value FROM settings WHERE key LIKE 'providerEnabledModels:%'"`
    );
  } catch (error) {
    console.error("[Migration] Error:", error);
    process.exit(1);
  } finally {
    db.close();
  }
}

await main();
