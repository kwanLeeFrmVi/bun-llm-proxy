export const RANGES = ["24h", "7d", "30d", "all"] as const;
export type Range = (typeof RANGES)[number];
