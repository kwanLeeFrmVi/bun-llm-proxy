import type { MavisUsageResponse, MavisUserProfile } from "@/lib/mavisTypes.ts";
import { MAVIS_QUOTA_DIVISOR } from "@/lib/mavisTypes.ts";
import { ProgressBar } from "./ProgressBar.tsx";
import { CountdownCard } from "./CountdownCard.tsx";

interface BudgetCardProps {
  profile: MavisUserProfile | null;
  usage: MavisUsageResponse | null;
}

export function BudgetCard({ profile, usage }: BudgetCardProps) {
  // Get budget info from Mavis API (not hardcoded)
  const planAllowance = profile?.planAllowance ?? usage?.plan_allowance ?? 0;
  const periodUsedQuota =
    profile?.periodUsedQuota ?? usage?.period_used_quota ?? 0;
  const planPeriod = profile?.planPeriod ?? usage?.plan_period ?? "2h";

  const budgetAmount = planAllowance / MAVIS_QUOTA_DIVISOR;
  const usedAmount = periodUsedQuota / MAVIS_QUOTA_DIVISOR;
  const remainingAmount = budgetAmount - usedAmount;
  const percentage = Math.min((usedAmount / budgetAmount) * 100, 100);

  const resetAt = profile?.periodResetAt ?? usage?.period_reset_at ?? "";
  const planName = profile?.planName ?? usage?.plan_name ?? "PRO";

  return (
    <div className="overflow-hidden rounded-xl bg-[var(--surface-container-lowest)] px-6 py-5 border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)] text-center">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-600 text-[var(--on-surface)]">
            Budget
          </span>
          <span className="rounded-full bg-[rgba(249,115,22,0.15)] px-2 py-0.5 text-[10px] font-600 uppercase tracking-[0.05em] text-[#f97316]">
            {planName}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-[var(--on-surface-variant)]">
            ${remainingAmount.toFixed(2)} remaining of $
            {budgetAmount.toFixed(2)} every {planPeriod}
          </span>
        </div>
      </div>

      <ProgressBar value={percentage} color={"#f97316"} />

      <div className="mt-2 flex justify-between">
        <span className="text-[12px] text-[var(--on-surface-variant)]">
          ${usedAmount.toFixed(2)} used
        </span>
        <CountdownCard target={resetAt} compact={true} />
      </div>
    </div>
  );
}
