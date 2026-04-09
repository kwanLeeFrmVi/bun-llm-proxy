import type { MavisUsageResponse } from "@/lib/mavisTypes.ts";

export function buildPricingMap(
  pricing: MavisUsageResponse["model_pricing"],
): Record<string, { input_ratio: number; output_ratio: number }> {
  const map: Record<string, { input_ratio: number; output_ratio: number }> = {};
  for (const p of pricing) {
    map[p.model] = { input_ratio: p.input_ratio, output_ratio: p.output_ratio };
  }
  return map;
}

export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  pricing: { input_ratio: number; output_ratio: number } | undefined,
): number {
  if (!pricing) return 0;
  return (
    (inputTokens * pricing.input_ratio + outputTokens * pricing.output_ratio) /
    1_000_000
  );
}
