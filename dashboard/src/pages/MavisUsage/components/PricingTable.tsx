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

export function PricingTable({ usage }: { usage: MavisUsageResponse | null }) {
  const pricing = usage?.model_pricing ?? [];
  if (pricing.length === 0) return null;

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
        title='Model Pricing Ratios'
        sub='Input/output ratio for cost estimation'
      />
      <Table>
        <TableHeader>
          <TableRow style={{ borderBottom: "1px solid rgba(203,213,225,0.4)" }}>
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
              Input Ratio
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
              Output Ratio
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pricing.map((p) => (
            <TableRow
              key={p.model}
              style={{ borderBottom: "1px solid rgba(203,213,225,0.25)" }}
            >
              <TableCell style={{ padding: "12px 24px" }}>
                <Badge variant='secondary'>{p.model}</Badge>
              </TableCell>
              <TableCell
                style={{
                  padding: "12px",
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                  color: "var(--primary)",
                }}
              >
                {p.input_ratio}
              </TableCell>
              <TableCell
                style={{
                  padding: "12px 24px",
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {p.output_ratio}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
