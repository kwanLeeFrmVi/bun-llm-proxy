import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api.ts";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertCircle } from "lucide-react";
import type {
  ZaiQuotaResponse,
  ZaiPerformanceResponse,
  ZaiUsageResponse,
  DateRange,
} from "@/lib/zaiTypes.ts";
import { RANGES, getDateRange } from "./utils.ts";
import { QuotaTab } from "./QuotaTab.tsx";
import { PerformanceTab } from "./PerformanceTab.tsx";
import { UsageTab } from "./UsageTab.tsx";

export default function ZaiUsage() {
  const [range, setRange] = useState<DateRange>("7d");

  const [quota, setQuota] = useState<ZaiQuotaResponse | null>(null);
  const [performance, setPerformance] = useState<ZaiPerformanceResponse | null>(null);
  const [usage, setUsage] = useState<ZaiUsageResponse | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const dates = getDateRange(range);
      const [quotaData, perfData, usageData] = await Promise.all([
        api.zai.getQuota(),
        api.zai.getPerformance(dates.start, dates.end),
        api.zai.getUsage(dates.start, dates.end),
      ]);
      setQuota(quotaData);
      setPerformance(perfData);
      setUsage(usageData);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ZAI data");
    } finally {
      setIsLoading(false);
    }
  }, [range]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
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

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-headline text-[28px] font-700 text-[var(--on-surface)] tracking-[-0.02em]">
            ZAI Usage
          </h1>
          <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-[var(--on-surface-variant)] font-500">
            Code Subscription &middot; api.z.ai
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Tabs value={range} onValueChange={(v) => setRange(v as DateRange)}>
            <TabsList className="h-9 bg-[var(--surface-container-low)] rounded-lg p-1">
              {RANGES.map((r) => (
                <TabsTrigger key={r} value={r} className="h-7 px-3 rounded-md text-[12px] font-500">
                  {r}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="h-9"
          >
            <RefreshCw className={`w-[14px] h-[14px] mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing" : "Refresh"}
          </Button>
        </div>
      </div>

      {lastUpdated && (
        <p className="-mt-2 text-[11px] text-[var(--on-surface-variant)]">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </p>
      )}

      {error && (
        <div className="flex gap-3 rounded-xl bg-[var(--surface-container-lowest)] p-6 border border-[rgba(203,213,225,0.6)]">
          <AlertCircle className="shrink-0 w-5 h-5 text-[#ef4444]" />
          <div>
            <p className="text-[13px] font-600 text-[#ef4444]">Failed to load ZAI data</p>
            <p className="mt-1 text-[11px] text-[var(--on-surface-variant)]">{error}</p>
            <p className="mt-1 text-[11px] text-[var(--on-surface-variant)]">
              Make sure{" "}
              <code className="bg-[var(--surface-container-low)] px-1.5 py-0.5 rounded text-[11px]">
                ZAI_USAGE_TOKEN
              </code>{" "}
              is set in your{" "}
              <code className="bg-[var(--surface-container-low)] px-1.5 py-0.5 rounded text-[11px]">
                .env
              </code>{" "}
              file.
            </p>
          </div>
        </div>
      )}

      {!quota || !performance || !usage || isLoading ? (
        <div className="px-12 py-12 text-center">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
          <p className="mt-3 text-[13px] text-[var(--on-surface-variant)]">Loading from api.z.ai</p>
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          <section>
            <h2 className="text-[14px] font-600 uppercase tracking-wider text-[var(--on-surface-variant)] mb-4 px-1">
              Quota & Limits
            </h2>
            <QuotaTab quota={quota} />
          </section>

          <section>
            <h2 className="text-[14px] font-600 uppercase tracking-wider text-[var(--on-surface-variant)] mb-4 px-1">
              Model Performance
            </h2>
            <PerformanceTab performance={performance} />
          </section>

          <section>
            <h2 className="text-[14px] font-600 uppercase tracking-wider text-[var(--on-surface-variant)] mb-4 px-1">
              Token Usage
            </h2>
            <UsageTab usage={usage} />
          </section>
        </div>
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
