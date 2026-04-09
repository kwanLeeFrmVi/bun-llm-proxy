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
      <div className="px-10 py-10 text-center text-[13px] text-[var(--on-surface-variant)]">
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
    <div className="overflow-hidden rounded-xl bg-[var(--surface-container-lowest)] border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
      <SectionHeader
        title='Usage by Model'
        sub='Token breakdown and estimated cost per model'
      />
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-[rgba(203,213,225,0.4)]">
              <TableHead className="px-6 py-3 text-[11px] uppercase tracking-[0.1em] text-[var(--on-surface-variant)]">
                Model
              </TableHead>
              <TableHead className="px-3 py-3 text-right text-[11px] uppercase tracking-[0.1em] text-[var(--on-surface-variant)]">
                Requests
              </TableHead>
              <TableHead className="px-3 py-3 text-right text-[11px] uppercase tracking-[0.1em] text-[var(--on-surface-variant)]">
                Input Tokens
              </TableHead>
              <TableHead className="px-3 py-3 text-right text-[11px] uppercase tracking-[0.1em] text-[var(--on-surface-variant)]">
                Output Tokens
              </TableHead>
              <TableHead className="px-3 py-3 text-right text-[11px] uppercase tracking-[0.1em] text-[var(--on-surface-variant)]">
                Failures
              </TableHead>
              <TableHead className="px-6 py-3 text-right text-[11px] uppercase tracking-[0.1em] text-[var(--on-surface-variant)]">
                Est. Cost
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ m, cost, share }) => (
              <TableRow
                key={m.model}
                className="border-b border-[rgba(203,213,225,0.25)]"
              >
                <TableCell className="px-6 py-3">
                  <Badge variant='endpoint'>{m.model}</Badge>
                  {share > 1 && (
                    <div className="mt-1.5 h-[3px] w-full rounded-full bg-[rgba(34,197,94,0.25)]">
                      <div
                        className="h-full rounded-full bg-[#22c55e]"
                        style={{ width: `${share}%` }}
                      />
                    </div>
                  )}
                </TableCell>
                <TableCell className="px-3 py-3 text-right tabular-nums">
                  {m.requests.toLocaleString()}
                </TableCell>
                <TableCell className="px-3 py-3 text-right tabular-nums text-[var(--primary)]">
                  {m.input_tokens.toLocaleString()}
                </TableCell>
                <TableCell className="px-3 py-3 text-right tabular-nums">
                  {m.output_tokens.toLocaleString()}
                </TableCell>
                <TableCell className={`px-3 py-3 text-right tabular-nums ${m.failures > 0 ? "text-[#ef4444]" : "text-[var(--on-surface-variant)]"}`}>
                  {m.failures}
                </TableCell>
                <TableCell className="px-6 py-3 text-right tabular-nums">
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
