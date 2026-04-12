import type { ProxRecent } from "@/lib/proxTypes.ts";
import { fmt, fmtDate } from "@/lib/formatters.ts";

interface ProxRecentTableProps {
  recent: ProxRecent | null;
  loading: boolean;
  onPageChange: (page: number) => void;
}

export function ProxRecentTable({ recent, loading, onPageChange }: ProxRecentTableProps) {
  const page = recent?.pagination.page ?? 1;
  const totalPages = recent?.pagination.total_pages ?? 1;

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
        <p
          style={{
            fontSize: "13px",
            fontWeight: 600,
            color: "var(--on-surface)",
          }}
        >
          Recent Requests
        </p>
        {recent && (
          <span
            style={{
              fontSize: "11px",
              color: "var(--on-surface-variant)",
            }}
          >
            {recent.pagination.total.toLocaleString()} total
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

      {!loading && (!recent || recent.logs.length === 0) && (
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

      {!loading && recent && recent.logs.length > 0 && (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(203,213,225,0.4)" }}>
                  {["Time", "Model", "Input", "Output", "Cost"].map((h) => (
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
                {recent.logs.map((log, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(203,213,225,0.2)" }}>
                    <td
                      style={{
                        padding: "8px 10px",
                        color: "var(--on-surface-variant)",
                        fontSize: "11px",
                      }}
                    >
                      {fmtDate(log.created_at)}
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        color: "var(--on-surface)",
                        fontFamily: "monospace",
                        fontSize: "11px",
                      }}
                    >
                      {log.model_display}
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        textAlign: "right",
                        color: "var(--on-surface)",
                      }}
                    >
                      {fmt(log.input_tokens)}
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        textAlign: "right",
                        color: "var(--on-surface)",
                      }}
                    >
                      {fmt(log.output_tokens)}
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        textAlign: "right",
                        color: "#f97316",
                        fontWeight: 600,
                      }}
                    >
                      ${log.total_cost.toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "12px",
            }}
          >
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              style={{
                fontSize: "12px",
                padding: "4px 12px",
                borderRadius: "6px",
                border: "1px solid rgba(203,213,225,0.6)",
                background: "var(--surface-container-low)",
                color: page <= 1 ? "var(--on-surface-variant)" : "var(--on-surface)",
                cursor: page <= 1 ? "not-allowed" : "pointer",
                opacity: page <= 1 ? 0.5 : 1,
              }}
            >
              Prev
            </button>
            <span
              style={{
                fontSize: "12px",
                color: "var(--on-surface-variant)",
              }}
            >
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              style={{
                fontSize: "12px",
                padding: "4px 12px",
                borderRadius: "6px",
                border: "1px solid rgba(203,213,225,0.6)",
                background: "var(--surface-container-low)",
                color: page >= totalPages ? "var(--on-surface-variant)" : "var(--on-surface)",
                cursor: page >= totalPages ? "not-allowed" : "pointer",
                opacity: page >= totalPages ? 0.5 : 1,
              }}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
