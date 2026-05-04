import type { CldbUsageItem } from "../index.tsx";
import { fmt, fmtDate } from "@/lib/formatters.ts";

interface CldbRecentTableProps {
  usage: CldbUsageItem[];
  loading: boolean;
}

export function CldbRecentTable({ usage, loading }: CldbRecentTableProps) {
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
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px",
        }}
      >
        <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--on-surface)" }}>
          Recent Requests
        </p>
        {!loading && (
          <span style={{ fontSize: "11px", color: "var(--on-surface-variant)" }}>
            {usage.length.toLocaleString()} shown
          </span>
        )}
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: "20px" }}>
          <div
            style={{
              display: "inline-block",
              width: "20px",
              height: "20px",
              border: "2px solid var(--primary)",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
        </div>
      )}

      {!loading && usage.length === 0 && (
        <p
          style={{
            fontSize: "12px",
            color: "var(--on-surface-variant)",
            textAlign: "center",
            padding: "20px",
          }}
        >
          No recent requests.
        </p>
      )}

      {!loading && usage.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(203,213,225,0.4)" }}>
                {["Time", "Model", "Input", "Output", "Cache Read", "Cache Write", "Cost"].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "6px 10px",
                      textAlign: "right",
                      fontWeight: 600,
                      color: "var(--on-surface-variant)",
                      textTransform: "uppercase",
                      fontSize: "10px",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {usage.map((item, i) => (
                <tr key={item.id ?? i} style={{ borderBottom: "1px solid rgba(203,213,225,0.2)" }}>
                  <td style={{ padding: "8px 10px", color: "var(--on-surface-variant)", fontSize: "11px" }}>
                    {fmtDate(item.createdAt)}
                  </td>
                  <td
                    style={{
                      padding: "8px 10px",
                      color: "var(--on-surface)",
                      fontFamily: "monospace",
                      fontSize: "11px",
                    }}
                  >
                    {item.model}
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: "var(--on-surface)" }}>
                    {fmt(item.promptTokens)}
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: "var(--on-surface)" }}>
                    {fmt(item.completionTokens)}
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: "var(--on-surface)" }}>
                    {fmt(item.cacheReadTokens)}
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: "var(--on-surface)" }}>
                    {fmt(item.cacheWriteTokens)}
                  </td>
                  <td
                    style={{
                      padding: "8px 10px",
                      textAlign: "right",
                      color: "#f97316",
                      fontWeight: 600,
                    }}
                  >
                    ${item.costUSD.toFixed(4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
