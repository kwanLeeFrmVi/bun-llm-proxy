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
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "16px",
      }}
    >
      <QuotaCard label='Plan' value={planName} sub='Current plan' />
      <div
        style={{
          background: "var(--surface-container-lowest)",
          borderRadius: "12px",
          padding: "24px",
          border: "1px solid rgba(203,213,225,0.6)",
          boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
        }}
      >
        <p
          style={{
            fontSize: "10px",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: "var(--on-surface-variant)",
            fontWeight: 600,
          }}
        >
          Quota Used
        </p>
        <p
          style={{
            fontSize: "28px",
            fontWeight: 700,
            marginTop: "4px",
            color: "var(--primary)",
            fontFamily: "var(--font-headline)",
          }}
        >
          {fmt(usedQuota)}
        </p>
        <p
          style={{
            fontSize: "11px",
            color: "var(--on-surface-variant)",
            marginTop: "4px",
          }}
        >
          of {fmt(quota)}
        </p>
        <ProgressBar value={p} />
        <p
          style={{
            fontSize: "11px",
            color: "var(--on-surface-variant)",
            marginTop: "6px",
          }}
        >
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
