import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api.ts";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, AlertCircle } from "lucide-react";
import type { MavisUsageResponse, MavisUserProfile } from "@/lib/mavisTypes.ts";
import { RANGES, type Range } from "./utils/constants.ts";
import { buildPricingMap } from "./utils/pricing.ts";
import { QuotaCards } from "./components/QuotaCards.tsx";
import { BudgetCard } from "./components/BudgetCard.tsx";
import { ModelTable } from "./components/ModelTable.tsx";
import { TimeseriesChart } from "./components/TimeseriesChart.tsx";
import { PricingTable } from "./components/PricingTable.tsx";

export default function MavisUsage() {
  const [range, setRange] = useState<Range>("24h");
  const [profile, setProfile] = useState<MavisUserProfile | null>(null);
  const [usage, setUsage] = useState<MavisUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [profileData, usageData] = await Promise.all([
        api.mavis.getMe() as Promise<MavisUserProfile>,
        api.mavis.getUsage(range) as Promise<MavisUsageResponse>,
      ]);
      setProfile(profileData);
      setUsage(usageData);
      setLastUpdated(new Date());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load from Mavis",
      );
    } finally {
      setLoading(false);
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
    setLoading(true);
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

      {loading && !usage ? (
        <div className='px-12 py-12 text-center'>
          <div className='inline-block h-6 w-6 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent' />
          <p className='mt-3 text-[13px] text-[var(--on-surface-variant)]'>
            Loading from mavis.io.vn
          </p>
        </div>
      ) : (
        <>
          <BudgetCard profile={profile} usage={usage} />
          <div className='grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4'>
            <QuotaCards profile={profile} usage={usage} />
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
