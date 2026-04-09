import type { ProxStatus } from "@/lib/proxTypes.ts";
import { ProgressBar } from "@/pages/MavisUsage/components/ProgressBar.tsx";
import { CountdownCard } from "@/pages/MavisUsage/components/CountdownCard.tsx";

interface ProxBudgetCardProps {
  status: ProxStatus | null;
}

export function ProxBudgetCard({ status }: ProxBudgetCardProps) {
  if (!status) {
    return (
      <div
        style={{
          background: "var(--surface-container-lowest)",
          borderRadius: "12px",
          padding: "20px 24px",
          border: "1px solid rgba(203,213,225,0.6)",
          boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
          textAlign: "center",
          height: "100px",
        }}
      />
    );
  }

  const rateLimitPct = Math.min(
    (status.rate_limit_window_spent / status.rate_limit_amount) * 100,
    100,
  );

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
                status.plan_type === "rate"
                  ? "rgba(249, 115, 22, 0.15)"
                  : "rgba(34, 197, 94, 0.15)",
              color: status.plan_type === "rate" ? "#f97316" : "#22c55e",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {status.plan_type}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span
            style={{
              fontSize: "12px",
              color: "var(--on-surface-variant)",
            }}
          >
            ${status.total_spent.toFixed(2)} total spent
          </span>
        </div>
      </div>

      {/* Rate limit bar */}
      {status.plan_type === "rate" && (
        <>
          <ProgressBar value={rateLimitPct} color={"#f97316"} />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: "8px",
            }}
          >
            <span
              style={{
                fontSize: "12px",
                color: "var(--on-surface-variant)",
              }}
            >
              {status.rate_limit_window_spent.toFixed(2)} / {status.rate_limit_amount} in
              window ({status.rate_limit_interval_hours}h)
            </span>
            <CountdownCard
              target={status.rate_limit_window_resets_at}
              compact={true}
            />
          </div>
        </>
      )}

      {/* Expiry for non-rate plans */}
      {status.plan_type !== "rate" && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: "4px",
          }}
        >
          <span
            style={{
              fontSize: "12px",
              color: "var(--on-surface-variant)",
            }}
          >
            Expires: {new Date(status.expiry).toLocaleDateString()} (
            {status.days_remaining}d remaining)
          </span>
        </div>
      )}
    </div>
  );
}
