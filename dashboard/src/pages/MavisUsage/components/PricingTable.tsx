import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MavisUsageResponse } from "@/lib/mavisTypes.ts";
import { SectionHeader } from "@/components/SectionHeader.tsx";

const TOP_MODELS_COUNT = 4;

export function PricingTable({ usage }: { usage: MavisUsageResponse | null }) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Sort models by usage (total_tokens) and get top models
  const topModels = useMemo(() => {
    const models = usage?.models ?? [];
    return [...models]
      .sort((a, b) => b.total_tokens - a.total_tokens)
      .slice(0, TOP_MODELS_COUNT)
      .map((m) => m.model);
  }, [usage]);

  // Sort pricing: top used models first, then alphabetically
  const sortedPricing = useMemo(() => {
    const pricing = usage?.model_pricing ?? [];
    const topSet = new Set(topModels);

    const topPricing = pricing.filter((p) => topSet.has(p.model));
    const restPricing = pricing
      .filter((p) => !topSet.has(p.model))
      .sort((a, b) => a.model.localeCompare(b.model));

    // Sort top pricing by usage order
    topPricing.sort(
      (a, b) => topModels.indexOf(a.model) - topModels.indexOf(b.model),
    );

    return [...topPricing, ...restPricing];
  }, [usage, topModels]);

  if (sortedPricing.length === 0) return null;

  const displayedPricing = isExpanded
    ? sortedPricing
    : sortedPricing.slice(0, TOP_MODELS_COUNT);
  const hasMore = sortedPricing.length > TOP_MODELS_COUNT;

  return (
    <div className='overflow-hidden rounded-xl bg-[var(--surface-container-lowest)] border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)]'>
      <SectionHeader
        title='Model Pricing'
        sub='Matches Mavis dashboard pricing'
      />
      <Table>
        <TableHeader>
          <TableRow className='border-b border-[rgba(203,213,225,0.4)]'>
            <TableHead className='px-6 py-3 text-[11px] uppercase tracking-[0.1em] text-[var(--on-surface-variant)]'>
              Model
            </TableHead>
            <TableHead className='px-3 py-3 text-right text-[11px] uppercase tracking-[0.1em] text-[var(--on-surface-variant)]'>
              input $/1M
            </TableHead>
            <TableHead className='px-3 py-3 text-right text-[11px] uppercase tracking-[0.1em] text-[var(--on-surface-variant)]'>
              output $/1M
            </TableHead>
            <TableHead className='px-6 py-3 text-right text-[11px] uppercase tracking-[0.1em] text-[var(--on-surface-variant)]'>
              CACHE $/1M
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {displayedPricing.map((p) => (
            <TableRow
              key={p.model}
              className='border-b border-[rgba(203,213,225,0.25)]'
            >
              <TableCell className='px-6 py-3'>
                <Badge variant='secondary'>{p.model}</Badge>
              </TableCell>
              <TableCell className='px-3 py-3 text-right tabular-nums text-[var(--primary)]'>
                ${(p.input_ratio * 2).toFixed(2)}
              </TableCell>
              <TableCell className='px-3 py-3 text-right tabular-nums'>
                ${(p.output_ratio * 2).toFixed(2)}
              </TableCell>
              <TableCell className='px-6 py-3 text-right tabular-nums text-[var(--on-surface-variant)]'>
                -
              </TableCell>
            </TableRow>
          ))}
          {hasMore && (
            <TableRow
              className='cursor-pointer hover:bg-[var(--surface-container-low)] transition-colors'
              onClick={() => setIsExpanded(!isExpanded)}
            >
              <TableCell className='px-6 py-3' colSpan={4}>
                <div className='flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.1em] text-[var(--on-surface-variant)]'>
                  {isExpanded ? (
                    <>
                      <span>Show less</span>
                      <ChevronUp className='w-4 h-4' />
                    </>
                  ) : (
                    <>
                      <span>
                        Show {sortedPricing.length - TOP_MODELS_COUNT} more
                        models
                      </span>
                      <ChevronDown className='w-4 h-4' />
                    </>
                  )}
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
