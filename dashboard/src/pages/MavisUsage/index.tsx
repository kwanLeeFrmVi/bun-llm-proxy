import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api.ts";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, AlertCircle } from "lucide-react";
import type { MavisUsageResponse } from "@/lib/mavisTypes.ts";
import { RANGES, type Range } from "./utils/constants.ts";
import { buildPricingMap, estimateCost } from "./utils/pricing.ts";
import { fmt } from "@/lib/formatters.ts";
import { BudgetCard } from "@/components/BudgetCard.tsx";
import { QuotaCard } from "@/components/QuotaCard.tsx";
import { ModelTable } from "./components/ModelTable.tsx";
import { TimeseriesChart } from "./components/TimeseriesChart.tsx";
import { PricingTable } from "./components/PricingTable.tsx";

export default function MavisUsage() {
  const [range, setRange] = useState<Range>("24h");
  const [usage, setUsage] = useState<MavisUsageResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setUsage(null); // clear stale data immediately
    setIsLoading(true);
    try {
      const usageData = await api.mavis.getUsage(range) as MavisUsageResponse;
      setUsage(usageData);
      setLastUpdated(new Date());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load from Mavis",
      );
    } finally {
      setIsLoading(false);
    }
  }, [range]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await api.mavis.refresh();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!refreshing) load();
    }, 60_000);
    return () => clearInterval(id);
  }, [load, refreshing]);

  const pricing = usage ? buildPricingMap(usage.model_pricing) : {};

  return (
    <div className='flex flex-col gap-6'>
      {/* Header */}
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <h1 className='font-headline text-[28px] font-700 text-[var(--on-surface)] tracking-[-0.02em]'>
            Mavis Usage
          </h1>
          <p className='mt-1 text-[11px] uppercase tracking-[0.12em] text-[var(--on-surface-variant)] font-500'>
            Upstream LLM Gateway &middot; mavis.io.vn
          </p>
        </div>
        <div className='flex items-center gap-3'>
          <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
            <TabsList className='h-9 bg-[var(--surface-container-low)] rounded-lg p-1'>
              {RANGES.map((r) => (
                <TabsTrigger
                  key={r}
                  value={r}
                  className='h-7 px-3 rounded-md text-[12px] font-500'
                >
                  {r}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Button
            variant='outline'
            size='sm'
            onClick={handleRefresh}
            disabled={refreshing}
            className='h-9'
          >
            <RefreshCw
              className={`w-[14px] h-[14px] mr-1.5 ${refreshing ? "animate-spin" : ""}`}
            />
            {refreshing ? "Refreshing" : "Refresh"}
          </Button>
        </div>
      </div>

      {lastUpdated && (
        <p className='-mt-2 text-[11px] text-[var(--on-surface-variant)]'>
          Last updated: {lastUpdated.toLocaleTimeString()}
        </p>
      )}

      {error && (
        <div className='flex gap-3 rounded-xl bg-[var(--surface-container-lowest)] p-6 border border-[rgba(203,213,225,0.6)]'>
          <AlertCircle className='shrink-0 w-5 h-5 text-[#ef4444]' />
          <div>
            <p className='text-[13px] font-600 text-[#ef4444]'>
              Failed to load Mavis data
            </p>
            <p className='mt-1 text-[11px] text-[var(--on-surface-variant)]'>
              {error}
            </p>
            <p className='mt-1 text-[11px] text-[var(--on-surface-variant)]'>
              Make sure{" "}
              <code className='bg-[var(--surface-container-low)] px-1.5 py-0.5 rounded text-[11px]'>
                MAVIS_USERNAME
              </code>{" "}
              and{" "}
              <code className='bg-[var(--surface-container-low)] px-1.5 py-0.5 rounded text-[11px]'>
                MAVIS_PASSWORD
              </code>{" "}
              are set in your{" "}
              <code className='bg-[var(--surface-container-low)] px-1.5 py-0.5 rounded text-[11px]'>
                .env
              </code>{" "}
              file.
            </p>
          </div>
        </div>
      )}

      {!usage || isLoading ? (
        <div className='px-12 py-12 text-center'>
          <div className='inline-block h-6 w-6 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent' />
          <p className='mt-3 text-[13px] text-[var(--on-surface-variant)]'>
            Loading from mavis.io.vn
          </p>
        </div>
      ) : (
        <>
          <BudgetCard
            source={{
              type: "mavis",
              planAllowance: usage.plan_allowance,
              periodUsedQuota: usage.period_used_quota,
              planPeriod: usage.plan_period,
              planName: usage.plan_name,
              periodResetAt: usage.period_reset_at,
            }}
          />
          {/* Quota cards */}
          <div className='grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4'>
            <QuotaCard
              label='Requests'
              value={fmt(usage?.summary?.total_requests ?? 0)}
              sub='Total requests'
            />
            <QuotaCard
              label='Input Tokens'
              value={fmt(usage?.summary?.total_tokens ?? 0)}
              sub='Prompt tokens'
            />
            <QuotaCard
              label='Output Tokens'
              value={fmt(usage?.summary?.total_tokens ?? 0)}
              sub='Completion tokens'
            />
            <QuotaCard
              label='Total Cost'
              value={
                "$" +
                (usage!.models.length > 0
                  ? usage!.models
                      .reduce(
                        (sum, m) =>
                          sum +
                          estimateCost(
                            m.input_tokens,
                            m.output_tokens,
                            pricing[m.model],
                          ),
                        0,
                      )
                      .toFixed(2)
                  : "0.00")
              }
              sub='Spend'
              color='#f97316'
            />
          </div>
          <ModelTable usage={usage} pricing={pricing} />
          <div className='grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4'>
            <TimeseriesChart usage={usage} />
            <PricingTable usage={usage} />
          </div>
        </>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
