import { fmt, fmtDate, fmtMs } from "@/lib/formatters.ts";

export interface RequestLogRow {
  id: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  creditsCost: number;
  durationMs: number;
  isStream: boolean;
  statusCode: number;
  isSuccess: boolean;
  endpoint?: string;
  provider?: string;
  discountLabel?: string;
  errorMessage?: string;
  createdAt: string;
}

interface RequestLogTableProps {
  rows: RequestLogRow[];
  loading?: boolean;
  pagination?: {
    page: number;
    totalPages: number;
    total: number;
  };
  onPageChange?: (page: number) => void;
}

function StatusBadge({ code, isSuccess }: { code: number; isSuccess: boolean }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{
        background: isSuccess ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
        color: isSuccess ? "#22c55e" : "#ef4444",
      }}
    >
      {code} {isSuccess ? "OK" : "ERR"}
    </span>
  );
}

function TokenCell({ input, output }: { input: number; output: number }) {
  return (
    <div className="text-right">
      <div className="flex items-center justify-end gap-1 text-[var(--on-surface)]">
        <span className="text-cyan-400">↑</span>
        <span>{fmt(input)}</span>
      </div>
      <div className="flex items-center justify-end gap-1 text-[var(--on-surface)]">
        <span className="text-pink-400">↓</span>
        <span>{fmt(output)}</span>
      </div>
    </div>
  );
}

export function RequestLogTable({
  rows,
  loading,
  pagination,
  onPageChange,
}: RequestLogTableProps) {
  return (
    <div
      className="rounded-xl bg-card overflow-hidden border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)]"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(203,213,225,0.4)]">
        <p className="text-[13px] font-semibold text-[var(--on-surface)]">Request History</p>
        {pagination && (
          <span className="text-[11px] text-[var(--on-surface-variant)]">
            {pagination.total.toLocaleString()} total
          </span>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div
            className="w-6 h-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"
          />
        </div>
      )}

      {/* Empty */}
      {!loading && rows.length === 0 && (
        <div className="text-center py-12">
          <p className="text-[12px] text-[var(--on-surface-variant)]">No requests in this period.</p>
        </div>
      )}

      {/* Table */}
      {!loading && rows.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: "12px", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(203,213,225,0.4)" }}>
                  {["Model", "Tokens", "Cost", "Latency", "Type", "Status", "Timestamp"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "6px 12px",
                        textAlign: h === "Tokens" || h === "Cost" || h === "Latency" || h === "Timestamp"
                          ? "right"
                          : "left",
                        fontWeight: 600,
                        color: "var(--on-surface-variant)",
                        textTransform: "uppercase",
                        fontSize: "10px",
                        letterSpacing: "0.06em",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    style={{ borderBottom: "1px solid rgba(203,213,225,0.15)" }}
                  >
                    {/* Model */}
                    <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: "11px" }}>
                      <span className="text-[var(--on-surface)]">{row.model}</span>
                      {row.discountLabel && (
                        <span
                          className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold"
                          style={{ background: "rgba(249,115,22,0.15)", color: "#f97316" }}
                        >
                          {row.discountLabel}
                        </span>
                      )}
                    </td>

                    {/* Tokens */}
                    <td style={{ padding: "8px 12px" }}>
                      <TokenCell
                        input={row.inputTokens}
                        output={row.outputTokens}
                      />
                    </td>

                    {/* Cost */}
                    <td
                      style={{
                        padding: "8px 12px",
                        textAlign: "right",
                        color: "#f97316",
                        fontWeight: 600,
                        fontSize: "11px",
                      }}
                    >
                      ${row.creditsCost.toFixed(4)}
                    </td>

                    {/* Latency */}
                    <td
                      style={{
                        padding: "8px 12px",
                        textAlign: "right",
                        color: "#ec4899",
                        fontWeight: 500,
                        fontSize: "11px",
                      }}
                    >
                      {fmtMs(row.durationMs)}
                    </td>

                    {/* Type */}
                    <td style={{ padding: "8px 12px" }}>
                      <span
                        className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold"
                        style={{
                          background:
                            row.isStream
                              ? "rgba(139,92,246,0.15)"
                              : "rgba(100,116,139,0.15)",
                          color: row.isStream ? "#8b5cf6" : "#64748b",
                        }}
                      >
                        {row.isStream ? "Stream" : "Normal"}
                      </span>
                    </td>

                    {/* Status */}
                    <td style={{ padding: "8px 12px" }}>
                      <StatusBadge code={row.statusCode} isSuccess={row.isSuccess} />
                    </td>

                    {/* Timestamp */}
                    <td
                      style={{
                        padding: "8px 12px",
                        textAlign: "right",
                        color: "var(--on-surface-variant)",
                        fontSize: "11px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {fmtDate(row.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-[rgba(203,213,225,0.4)]">
              <button
                onClick={() => onPageChange?.(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="px-3 py-1.5 rounded-md border border-[rgba(203,213,225,0.6)] bg-[var(--surface-container-low)] text-[12px] text-[var(--on-surface)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--surface-container)] transition-colors"
              >
                Prev
              </button>
              <span className="text-[12px] text-[var(--on-surface-variant)]">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => onPageChange?.(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="px-3 py-1.5 rounded-md border border-[rgba(203,213,225,0.6)] bg-[var(--surface-container-low)] text-[12px] text-[var(--on-surface)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--surface-container)] transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
