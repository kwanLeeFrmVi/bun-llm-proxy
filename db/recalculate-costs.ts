/**
 * Recalculate costs for existing usage_log entries
 * Run: bun run db/recalculate-costs.ts
 */

import { join } from "node:path";
import { homedir } from "node:os";
import { getRawDb } from "./connection.ts";
import { normalizeModelName, stripSuffixes, baseModelName } from "../services/pricingSync.ts";

const DATA_DIR = process.env.DATA_DIR ?? join(homedir(), ".bunLLM");
const DB_PATH = join(DATA_DIR, "router.db");

async function main() {
  const db = getRawDb();
  console.log(`[RECALCULATE] Database: ${DB_PATH}`);

  // Fetch all pricing data
  const pricingRows = db
    .query<
      { provider: string; model: string; input: number; output: number },
      []
    >("SELECT provider, model, input, output FROM pricing")
    .all();

  if (pricingRows.length === 0) {
    console.log("[RECALCULATE] No pricing data found. Run pricing sync first:");
    console.log(
      "  curl -X POST http://localhost:20129/api/pricing/sync -H 'Authorization: Bearer TOKEN'"
    );
    process.exit(1);
  }

  // Build pricing lookup
  const pricing: Record<string, Record<string, { input: number; output: number }>> = {};
  for (const row of pricingRows) {
    if (!pricing[row.provider]) {
      pricing[row.provider] = {};
    }
    pricing[row.provider]![row.model] = { input: row.input, output: row.output };
  }

  // Get entries with zero cost but with tokens
  const entries = db
    .query<
      {
        id: string;
        provider: string;
        model: string;
        prompt_tokens: number;
        completion_tokens: number;
      },
      []
    >(
      `SELECT id, provider, model, prompt_tokens, completion_tokens
       FROM usage_log
       WHERE cost = 0 AND (prompt_tokens > 0 OR completion_tokens > 0)
       AND status != 'pending'`
    )
    .all();

  console.log(`[RECALCULATE] Found ${entries.length} entries to recalculate`);

  let updated = 0;
  let notFound = 0;

  for (const entry of entries) {
    const { id, provider, model, prompt_tokens, completion_tokens } = entry;

    // Try to find pricing
    let cost = 0;

    // 1. Exact match
    if (pricing[provider]?.[model]) {
      const p = pricing[provider]![model]!;
      cost = (prompt_tokens * p.input) / 1_000_000 + (completion_tokens * p.output) / 1_000_000;
    }
    // 2. Normalized match
    else if (pricing[provider]?.[normalizeModelName(model)]) {
      const p = pricing[provider]![normalizeModelName(model)]!;
      cost = (prompt_tokens * p.input) / 1_000_000 + (completion_tokens * p.output) / 1_000_000;
    }
    // 3. Stripped match
    else if (pricing[provider]?.[stripSuffixes(model)]) {
      const p = pricing[provider]![stripSuffixes(model)]!;
      cost = (prompt_tokens * p.input) / 1_000_000 + (completion_tokens * p.output) / 1_000_000;
    }
    // 4. Base model match
    else if (pricing[provider]?.[baseModelName(model)]) {
      const p = pricing[provider]![baseModelName(model)]!;
      cost = (prompt_tokens * p.input) / 1_000_000 + (completion_tokens * p.output) / 1_000_000;
    }
    // 5. Try openrouter provider with any model match
    else if (pricing.openrouter) {
      for (const [key, value] of Object.entries(pricing.openrouter)) {
        if (
          key === model ||
          key === normalizeModelName(model) ||
          key === stripSuffixes(model) ||
          key === baseModelName(model) ||
          normalizeModelName(key) === normalizeModelName(model)
        ) {
          cost =
            (prompt_tokens * value.input) / 1_000_000 +
            (completion_tokens * value.output) / 1_000_000;
          break;
        }
      }
    }

    if (cost > 0) {
      db.run("UPDATE usage_log SET cost = ? WHERE id = ?", [cost, id]);
      updated++;
    } else {
      notFound++;
    }
  }

  console.log(`[RECALCULATE] Updated ${updated} entries`);
  console.log(`[RECALCULATE] No pricing found for ${notFound} entries`);
  console.log("[RECALCULATE] Done!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
