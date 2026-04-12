import { ProgressBar } from "@/components/ProgressBar.tsx";
import { CountdownCard } from "@/components/CountdownCard.tsx";
import { MAVIS_QUOTA_DIVISOR } from "@/lib/mavisTypes.ts";

// ─── Shared type ───────────────────────────────────────────────────────────────

export type BudgetSource =
  | {
      type: "mavis";
      planAllowance: number;
      periodUsedQuota: number;
      planPeriod: string;
      planName: string;
      periodResetAt: string;
    }
  | {
      type: "prox";
      planType: string;
      rateLimitAmount: number;
      rateLimitSpent: number;
      rateLimitHours: number;
      rateLimitResetsAt: string;
      expiry: string;
      daysRemaining: number;
      totalSpent: number;
    };

// ─── Helpers ────────────────────────────────────────────────────────────────────

function mavisPct(used: number, total: number) {
  return Math.min(100, total > 0 ? (used / total) * 100 : 0);
}

function proxPct(spent: number, total: number) {
  return Math.min(100, total > 0 ? (spent / total) * 100 : 0);
}

// ─── Component ─────────────────────────────────────────────────────────────────

interface BudgetCardProps {
  source: BudgetSource;
}

export function BudgetCard({ source }: BudgetCardProps) {
  if (source.type === "mavis") {
    const { planAllowance, periodUsedQuota, planPeriod, planName, periodResetAt } = source;
    const budget = planAllowance / MAVIS_QUOTA_DIVISOR;
    const used = periodUsedQuota / MAVIS_QUOTA_DIVISOR;
    const remaining = budget - used;
    const pct = mavisPct(used, budget);

    return (
      <div
        style={{
          background: "var(--surface-container-lowest)",
          borderRadius: "12px",
          padding: "20px 24px",
          border: "1px solid rgba(203,213,225,0.6)",
          boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--on-surface)",
              }}
            >
              Mavis Budget
            </span>
            <span
              style={{
                fontSize: "10px",
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: "9999px",
                background: "rgba(249, 115, 22, 0.15)",
                color: "#f97316",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {planName}
            </span>
          </div>
          <span style={{ fontSize: "12px", color: "var(--on-surface-variant)" }}>
            ${remaining.toFixed(2)} remaining of ${budget.toFixed(2)} every {planPeriod}
          </span>
        </div>

        <ProgressBar value={pct} color={"#f97316"} />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: "8px",
          }}
        >
          <span style={{ fontSize: "12px", color: "var(--on-surface-variant)" }}>
            ${used.toFixed(2)} used
          </span>
          <CountdownCard target={periodResetAt} compact={true} />
        </div>
      </div>
    );
  }

  // prox
  const {
    planType,
    rateLimitAmount,
    rateLimitSpent,
    rateLimitHours,
    rateLimitResetsAt,
    expiry,
    daysRemaining,
    totalSpent,
  } = source;
  const pct = proxPct(rateLimitSpent, rateLimitAmount);

  return (
    <div
      style={{
        background: "var(--surface-container-lowest)",
        borderRadius: "12px",
        padding: "20px 24px",
        border: "1px solid rgba(203,213,225,0.6)",
        boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--on-surface)",
            }}
          >
            Pro-X Budget
          </span>
          <span
            style={{
              fontSize: "10px",
              fontWeight: 600,
              padding: "2px 8px",
              borderRadius: "9999px",
              background:
                planType === "rate" ? "rgba(249, 115, 22, 0.15)" : "rgba(34, 197, 94, 0.15)",
              color: planType === "rate" ? "#f97316" : "#22c55e",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {planType}
          </span>
        </div>
        <span style={{ fontSize: "12px", color: "var(--on-surface-variant)" }}>
          ${totalSpent.toFixed(2)} total spent
        </span>
      </div>

      {planType === "rate" && (
        <>
          <ProgressBar value={pct} color={"#f97316"} />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: "8px",
            }}
          >
            <span style={{ fontSize: "12px", color: "var(--on-surface-variant)" }}>
              {rateLimitSpent.toFixed(2)} / {rateLimitAmount} in window ({rateLimitHours}h)
            </span>
            <CountdownCard target={rateLimitResetsAt} compact={true} />
          </div>
        </>
      )}

      {planType !== "rate" && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: "4px",
          }}
        >
          <span style={{ fontSize: "12px", color: "var(--on-surface-variant)" }}>
            Expires: {new Date(expiry).toLocaleDateString()} ({daysRemaining}d remaining)
          </span>
        </div>
      )}
    </div>
  );
}
