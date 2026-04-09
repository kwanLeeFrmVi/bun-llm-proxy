import type { ProxSummaryItem } from "@/lib/proxTypes.ts";
import { fmt } from "../utils/formatters.ts";

interface ProxModelTableProps {
  summary: ProxSummaryItem[];
}

export function ProxModelTable({ summary }: ProxModelTableProps) {
  if (summary.length === 0) {
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
        <p
          style={{
            fontSize: "13px",
            fontWeight: 600,
            color: "var(--on-surface)",
            marginBottom: "12px",
          }}
        >
          Model Breakdown
        </p>
        <p
          style={{
            fontSize: "12px",
            color: "var(--on-surface-variant)",
            textAlign: "center",
            padding: "20px",
          }}
        >
          No model data available.
        </p>
      </div>
    );
  }

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
      <p
        style={{
          fontSize: "13px",
          fontWeight: 600,
          color: "var(--on-surface)",
          marginBottom: "12px",
        }}
      >
        Model Breakdown
      </p>
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "12px",
          }}
        >
          <thead>
            <tr
              style={{
                borderBottom:
                  "1px solid rgba(203,213,225,0.4)",
              }}
            >
              {[
                "Model",
                "Requests",
                "Input Tokens",
                "Output Tokens",
                "Total Cost",
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "8px 12px",
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
            {summary.map((item) => (
              <tr
                key={item.model}
                style={{
                  borderBottom:
                    "1px solid rgba(203,213,225,0.2)",
                }}
              >
                <td
                  style={{
                    padding: "10px 12px",
                    color: "var(--on-surface)",
                    fontFamily: "monospace",
                    fontSize: "11px",
                  }}
                >
                  {item.model}
                </td>
                <td
                  style={{
                    padding: "10px 12px",
                    textAlign: "right",
                    color: "var(--on-surface)",
                  }}
                >
                  {fmt(item.total_requests)}
                </td>
                <td
                  style={{
                    padding: "10px 12px",
                    textAlign: "right",
                    color: "var(--on-surface)",
                  }}
                >
                  {fmt(item.total_input_tokens)}
                </td>
                <td
                  style={{
                    padding: "10px 12px",
                    textAlign: "right",
                    color: "var(--on-surface)",
                  }}
                >
                  {fmt(item.total_output_tokens)}
                </td>
                <td
                  style={{
                    padding: "10px 12px",
                    textAlign: "right",
                    color: "#f97316",
                    fontWeight: 600,
                  }}
                >
                  ${item.total_cost.toFixed(4)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
