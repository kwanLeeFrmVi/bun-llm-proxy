import { QuotaCard } from "@/components/QuotaCard.tsx";
import { ProgressBar } from "@/components/ProgressBar.tsx";
import { CountdownCard } from "@/components/CountdownCard.tsx";
import type { ZaiQuotaResponse } from "@/lib/zaiTypes.ts";
import { fmt } from "@/lib/formatters.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface QuotaLimitCardProps {
  limit: {
    type: string;
    unit: number;
    number: number;
    usage?: number;
    currentValue?: number;
    remaining?: number;
    percentage: number;
    nextResetTime: number;
    usageDetails?: Array<{ modelCode: string; usage: number }>;
  };
}

function QuotaLimitCard({ limit }: QuotaLimitCardProps) {
  const {
    type,
    unit,
    number,
    usage,
    currentValue,
    remaining,
    percentage,
    nextResetTime,
    usageDetails,
  } = limit;

  const getTypeLabel = () => {
    if (type === "TIME_LIMIT") {
      return unit === 5
        ? "Total Monthly Web Search / Reader / Zread Quota"
        : unit === 1
          ? "Requests/Second"
          : "Time Limit";
    }
    if (type === "TOKENS_LIMIT") {
      if (unit === 6) return "Weekly Quota";
      if (unit === 5) return "Monthly Quota";
      if (unit === 3) return `${number} Hours Quota`;

      const unitLabels: Record<number, string> = {
        1: "Day",
        3: "Hours",
        5: "Month",
        6: "Week",
      };
      const unitLabel = unitLabels[unit] || unit;
      return `${unitLabel} Quota`;
    }
    return type;
  };

  const getLimitValue = () => {
    if (type === "TIME_LIMIT") {
      if (unit === 5) return `${fmt(usage || number)} calls`;
      return `${number} ${unit === 1 ? "req/sec" : ""}`;
    }
    if (type === "TOKENS_LIMIT") {
      // If number is small (like 1 or 5), it's likely a frequency multiplier, not the token count
      if (number < 1000) return "Based on plan level";
      return fmt(number) + " tokens";
    }
    return String(number);
  };

  const getUsageValue = () => {
    if (type === "TIME_LIMIT") {
      return currentValue !== undefined ? fmt(currentValue) : "-";
    }
    if (type === "TOKENS_LIMIT") {
      if (number < 1000) return `${percentage}%`;
      const used = Math.round((percentage / 100) * number);
      return fmt(used);
    }
    return "-";
  };

  return (
    <div className="overflow-hidden rounded-xl bg-[var(--surface-container-lowest)] border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
      <div className="border-b border-[rgba(203,213,225,0.4)] px-6 py-4 flex items-center justify-between">
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <p className="text-[13px] font-600 text-[var(--on-surface)]">{getTypeLabel()}</p>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3.5 h-3.5 text-[var(--on-surface-variant)] cursor-help opacity-70 hover:opacity-100 transition-opacity" />
                </TooltipTrigger>
                <TooltipContent className="text-[11px] max-w-[200px]">
                  {type === "TIME_LIMIT" && unit === 5
                    ? "Quota for web searching, document reading, and other tool-based interactions."
                    : `Usage limit for ${getTypeLabel().toLowerCase()}.`}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="mt-0.5 text-[11px] text-[var(--on-surface-variant)]">
            Limit: {getLimitValue()}
          </p>
        </div>
        <Badge
          variant="outline"
          className={
            percentage >= 80
              ? "text-red-600 border-red-200 bg-red-50/50"
              : percentage >= 50
                ? "text-amber-600 border-amber-200 bg-amber-50/50"
                : "text-green-600 border-green-200 bg-green-50/50"
          }
        >
          {percentage}%
        </Badge>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <QuotaCard
            label="Used"
            value={getUsageValue()}
            sub={
              type === "TOKENS_LIMIT"
                ? number >= 1000
                  ? "tokens"
                  : ""
                : type === "TIME_LIMIT" && unit === 5
                  ? "calls"
                  : ""
            }
          />
          <QuotaCard
            label="Remaining"
            value={
              remaining !== undefined
                ? fmt(remaining)
                : type === "TOKENS_LIMIT"
                  ? number >= 1000
                    ? fmt(number - Math.round((percentage / 100) * number))
                    : `${100 - percentage}%`
                  : type === "TIME_LIMIT" && unit === 5
                    ? fmt((usage || number) - (currentValue || 0))
                    : "-"
            }
            sub={
              type === "TOKENS_LIMIT"
                ? number >= 1000
                  ? "tokens"
                  : ""
                : type === "TIME_LIMIT" && unit === 5
                  ? "calls"
                  : ""
            }
          />
        </div>

        <ProgressBar value={percentage} />

        {nextResetTime > 0 && (
          <div className="mt-4 flex items-center justify-between">
            <span className="text-[12px] text-[var(--on-surface-variant)]">Resets in</span>
            <div className="flex flex-col items-end">
              <CountdownCard target={String(nextResetTime)} compact />
              <span className="text-[10px] text-[var(--on-surface-variant)] mt-1 opacity-60">
                {new Date(nextResetTime).toLocaleString()}
              </span>
            </div>
          </div>
        )}

        {usageDetails && usageDetails.length > 0 && (
          <div className="mt-4 pt-4 border-t border-[rgba(203,213,225,0.3)]">
            <p className="text-[11px] font-600 text-[var(--on-surface-variant)] mb-2">
              Usage by Model
            </p>
            <div className="space-y-1">
              {usageDetails.map((detail) => (
                <div key={detail.modelCode} className="flex justify-between text-[12px]">
                  <span className="text-[var(--on-surface-variant)]">{detail.modelCode}</span>
                  <span className="text-[var(--on-surface)] font-500">{detail.usage}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function QuotaTab({ quota }: { quota: ZaiQuotaResponse }) {
  if (!quota.success || !quota.data?.limits?.length) {
    return (
      <div className="px-12 py-12 text-center text-[13px] text-[var(--on-surface-variant)]">
        No quota data available.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--on-surface-variant)] font-600">
          Plan Level
        </span>
        <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[11px] font-bold uppercase">
          {quota.data.level}
        </span>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
        {quota.data.limits.map((limit, idx) => (
          <QuotaLimitCard key={idx} limit={limit} />
        ))}
      </div>
    </div>
  );
}
