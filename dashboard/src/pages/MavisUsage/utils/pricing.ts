import type { MavisUsageResponse } from "@/lib/mavisTypes.ts";

// Multiply by 2 to correct for half-price API (Mavis API returns prices that are 2x lower)
const RATIO_MULTIPLIER = 2;

export function buildPricingMap(
  pricing: MavisUsageResponse["model_pricing"]
): Record<string, { input_ratio: number; output_ratio: number }> {
  const map: Record<string, { input_ratio: number; output_ratio: number }> = {};
  for (const p of pricing) {
    map[p.model] = {
      input_ratio: p.input_ratio * RATIO_MULTIPLIER,
      output_ratio: p.output_ratio * RATIO_MULTIPLIER,
    };
  }
  return map;
}

export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  pricing: { input_ratio: number; output_ratio: number } | undefined
): number {
  if (!pricing) return 0;
  return (inputTokens * pricing.input_ratio + outputTokens * pricing.output_ratio) / 1_000_000;
}
