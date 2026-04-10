import type { DateRange } from "@/lib/zaiTypes.ts";

export function getDateRange(range: DateRange): { start: string; end: string } {
  const end = new Date();
  const start = new Date();

  switch (range) {
    case "24h":
      start.setHours(start.getHours() - 24);
      break;
    case "7d":
      start.setDate(start.getDate() - 7);
      break;
    case "30d":
      start.setDate(start.getDate() - 30);
      break;
  }

  return {
    start: formatZaiDate(start),
    end: formatZaiDate(end),
  };
}

function formatZaiDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d} 00:00:00`;
}

export const RANGES: DateRange[] = ["24h", "7d", "30d"];
