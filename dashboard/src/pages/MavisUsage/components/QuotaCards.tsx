import type { MavisUsageResponse, MavisUserProfile } from "@/lib/mavisTypes.ts";
import { QuotaCard } from "./QuotaCard.tsx";
import { CountdownCard } from "./CountdownCard.tsx";
import { ProgressBar } from "./ProgressBar.tsx";
import { pct, fmt } from "../utils/formatters.ts";

export function QuotaCards({
  profile,
  usage,
}: {
  profile: MavisUserProfile | null;
  usage: MavisUsageResponse | null;
}) {
  const quota = profile?.quota ?? usage?.quota ?? 0;
  const usedQuota = profile?.usedQuota ?? usage?.used_quota ?? 0;
  const requests = usage?.summary?.total_requests ?? 0;
  const success = usage?.summary?.success_count ?? 0;
  const failures = usage?.summary?.failure_count ?? 0;
  const resetAt = profile?.periodResetAt ?? usage?.period_reset_at ?? "";
  const planName = profile?.planName ?? usage?.plan_name ?? "-";
  const period = profile?.planPeriod ?? usage?.plan_period ?? "";
  const p = pct(usedQuota, quota);

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
      <QuotaCard label='Plan' value={planName} sub='Current plan' />
      <div className="flex flex-col items-center justify-center rounded-xl bg-[var(--surface-container-lowest)] p-6 border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
        <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--on-surface-variant)] font-600">
          Quota Used
        </p>
        <p className="mt-1 font-headline text-[28px] font-700 text-[var(--primary)]">
          {fmt(usedQuota)}
        </p>
        <p className="mt-1 text-[11px] text-[var(--on-surface-variant)]">
          of {fmt(quota)}
        </p>
        <ProgressBar value={p} />
        <p className="mt-1.5 text-[11px] text-[var(--on-surface-variant)]">
          {p}% used
        </p>
      </div>
      <QuotaCard
        label='Requests'
        value={fmt(requests)}
        sub={`${success} ok / ${failures} failed`}
      />
      <CountdownCard target={resetAt} sub={`${period} period`} />
    </div>
  );
}
