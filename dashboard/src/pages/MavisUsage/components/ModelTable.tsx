import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MavisUsageResponse } from "@/lib/mavisTypes.ts";
import { SectionHeader } from "./SectionHeader.tsx";
import { estimateCost } from "../utils/pricing.ts";

export function ModelTable({
  usage,
  pricing,
}: {
  usage: MavisUsageResponse | null;
  pricing: ReturnType<typeof import("../utils/pricing.ts").buildPricingMap>;
}) {
  const models = usage?.models ?? [];
  const totalTokens = usage?.summary?.total_tokens ?? 0;

  if (models.length === 0) {
    return (
      <div
        style={{
          padding: "40px",
          textAlign: "center",
          color: "var(--on-surface-variant)",
          fontSize: "13px",
        }}
      >
        No model data available.
      </div>
    );
  }

  const rows = models.map((m) => {
    const pr = pricing[m.model];
    const cost = estimateCost(m.input_tokens, m.output_tokens, pr);
    const share =
      totalTokens > 0 ? Math.round((m.total_tokens / totalTokens) * 100) : 0;
    return { m, cost, share };
  });

  return (
    <div
      style={{
        background: "var(--surface-container-lowest)",
        borderRadius: "12px",
        border: "1px solid rgba(203,213,225,0.6)",
        boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
        overflow: "hidden",
      }}
    >
      <SectionHeader
        title='Usage by Model'
        sub='Token breakdown and estimated cost per model'
      />
      <div style={{ overflowX: "auto" }}>
        <Table>
          <TableHeader>
            <TableRow
              style={{
                borderBottom: "1px solid rgba(203,213,225,0.4)",
              }}
            >
              <TableHead
                style={{
                  padding: "12px 24px",
                  color: "var(--on-surface-variant)",
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Model
              </TableHead>
              <TableHead
                style={{
                  padding: "12px",
                  color: "var(--on-surface-variant)",
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  textAlign: "right",
                }}
              >
                Requests
              </TableHead>
              <TableHead
                style={{
                  padding: "12px",
                  color: "var(--on-surface-variant)",
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  textAlign: "right",
                }}
              >
                Input Tokens
              </TableHead>
              <TableHead
                style={{
                  padding: "12px",
                  color: "var(--on-surface-variant)",
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  textAlign: "right",
                }}
              >
                Output Tokens
              </TableHead>
              <TableHead
                style={{
                  padding: "12px",
                  color: "var(--on-surface-variant)",
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  textAlign: "right",
                }}
              >
                Failures
              </TableHead>
              <TableHead
                style={{
                  padding: "12px 24px",
                  color: "var(--on-surface-variant)",
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  textAlign: "right",
                }}
              >
                Est. Cost
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ m, cost, share }) => (
              <TableRow
                key={m.model}
                style={{
                  borderBottom: "1px solid rgba(203,213,225,0.25)",
                }}
              >
                <TableCell style={{ padding: "12px 24px" }}>
                  <Badge variant='endpoint'>{m.model}</Badge>
                  {share > 15 && (
                    <div
                      style={{
                        marginTop: "6px",
                        height: "3px",
                        borderRadius: "9999px",
                        background: "rgba(34,197,94,0.25)",
                        width: "100%",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: share + "%",
                          borderRadius: "9999px",
                          background: "#22c55e",
                        }}
                      />
                    </div>
                  )}
                </TableCell>
                <TableCell
                  style={{
                    padding: "12px",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {m.requests.toLocaleString()}
                </TableCell>
                <TableCell
                  style={{
                    padding: "12px",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                    color: "var(--primary)",
                  }}
                >
                  {m.input_tokens.toLocaleString()}
                </TableCell>
                <TableCell
                  style={{
                    padding: "12px",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {m.output_tokens.toLocaleString()}
                </TableCell>
                <TableCell
                  style={{
                    padding: "12px",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                    color:
                      m.failures > 0 ? "#ef4444" : "var(--on-surface-variant)",
                  }}
                >
                  {m.failures}
                </TableCell>
                <TableCell
                  style={{
                    padding: "12px 24px",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  ${cost.toFixed(4)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
