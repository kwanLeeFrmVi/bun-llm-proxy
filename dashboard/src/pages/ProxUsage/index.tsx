import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api.ts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, AlertCircle } from "lucide-react";
import type { ProxStatus, ProxSummary, ProxChart, ProxRecent } from "@/lib/proxTypes.ts";
import { BudgetCard } from "@/components/BudgetCard.tsx";
import { QuotaCard } from "@/components/QuotaCard.tsx";
import { fmt } from "@/lib/formatters.ts";
import { ProxModelTable } from "./components/ProxModelTable.tsx";
import { ProxRecentTable } from "./components/ProxRecentTable.tsx";
import { ProxTimeseriesChart } from "./components/ProxTimeseriesChart.tsx";

const DAYS_OPTIONS = [
  { label: "7d", value: 7 },
  { label: "14d", value: 14 },
  { label: "30d", value: 30 },
];

export default function ProxUsage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [keys, setKeys] = useState<{ id: string; maskedName: string }[]>([]);
  const [status, setStatus] = useState<ProxStatus | null>(null);
  const [summary, setSummary] = useState<ProxSummary | null>(null);
  const [chart, setChart] = useState<ProxChart | null>(null);
  const [recent, setRecent] = useState<ProxRecent | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const selectedKey = searchParams.get("key") ?? "";
  const days = parseInt(searchParams.get("days") ?? "30", 10);

  // Load keys once on mount
  useEffect(() => {
    api.prox
      .listKeys()
      .then((data) => setKeys(data.keys))
      .catch(() => setKeys([]));
  }, []);

  // Load data whenever URL params change
  useEffect(() => {
    let cancelled = false;
    setError(null);
    setLoading(true);

    (async () => {
      try {
        const [s, sm, sc, r] = await Promise.all([
          api.prox.getStatus(selectedKey || undefined) as Promise<ProxStatus>,
          api.prox.getSummary(days, selectedKey || undefined) as Promise<ProxSummary>,
          api.prox.getChart(days, selectedKey || undefined) as Promise<ProxChart>,
          api.prox.getRecent(1, 15, selectedKey || undefined) as Promise<ProxRecent>,
        ]);
        if (!cancelled) {
          setStatus(s);
          setSummary(sm);
          setChart(sc);
          setRecent(r);
          setLastUpdated(new Date());
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load Pro-X data",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedKey, days]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const data = await api.prox.listKeys();
      setKeys(data.keys);
      const [s, sm, sc, r] = await Promise.all([
        api.prox.getStatus(selectedKey || undefined) as Promise<ProxStatus>,
        api.prox.getSummary(days, selectedKey || undefined) as Promise<ProxSummary>,
        api.prox.getChart(days, selectedKey || undefined) as Promise<ProxChart>,
        api.prox.getRecent(1, 15, selectedKey || undefined) as Promise<ProxRecent>,
      ]);
      setStatus(s);
      setSummary(sm);
      setChart(sc);
      setRecent(r);
      setLastUpdated(new Date());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load Pro-X data",
      );
    } finally {
      setRefreshing(false);
    }
  };

  const handleKeyChange = (keyId: string) => {
    if (!keyId) {
      setSearchParams((p) => {
        p.delete("key");
        return p;
      });
    } else {
      setSearchParams((p) => {
        p.set("key", keyId);
        return p;
      });
    }
  };

  const handleDaysChange = (d: number) => {
    setSearchParams((p) => {
      p.set("days", String(d));
      return p;
    });
  };

  return (
    <div className='flex flex-col gap-6'>
      {/* Header */}
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <h1 className='font-headline text-[28px] font-700 text-[var(--on-surface)] tracking-[-0.02em]'>
            Pro-X Usage
          </h1>
          <p className='mt-1 text-[11px] uppercase tracking-[0.12em] text-[var(--on-surface-variant)] font-500'>
            Upstream LLM Gateway &middot; pro-x.io.vn
          </p>
        </div>
        <div className='flex items-center gap-3'>
          {/* Key filter tabs */}
          <Tabs value={selectedKey} onValueChange={handleKeyChange}>
            <TabsList className='h-9 bg-[var(--surface-container-low)] rounded-lg p-1 flex-wrap max-w-[400px]'>
              <TabsTrigger
                key='ALL'
                value=''
                className='h-7 px-3 rounded-md text-[12px] font-500'
              >
                ALL
              </TabsTrigger>
              {keys.map((k) => (
                <TabsTrigger
                  key={k.id}
                  value={k.id}
                  className='h-7 px-3 rounded-md text-[12px] font-500'
                >
                  {k.maskedName}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {/* Days filter */}
          <Tabs
            value={String(days)}
            onValueChange={(v) => handleDaysChange(Number(v))}
          >
            <TabsList className='h-9 bg-[var(--surface-container-low)] rounded-lg p-1'>
              {DAYS_OPTIONS.map((opt) => (
                <TabsTrigger
                  key={opt.value}
                  value={String(opt.value)}
                  className='h-7 px-3 rounded-md text-[12px] font-500'
                >
                  {opt.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className='h-9 px-4 flex items-center gap-2 rounded-md border border-[rgba(203,213,225,0.6)] bg-[var(--surface-container-low)] text-[var(--on-surface)] text-[12px] font-500 hover:bg-[var(--surface-container)] transition-colors disabled:opacity-50'
          >
            <RefreshCw
              className={`w-[14px] h-[14px] ${refreshing ? "animate-spin" : ""}`}
            />
            {refreshing ? "Refreshing" : "Refresh"}
          </button>
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
              Failed to load Pro-X data
            </p>
            <p className='mt-1 text-[11px] text-[var(--on-surface-variant)]'>
              {error}
            </p>
            <p className='mt-1 text-[11px] text-[var(--on-surface-variant)]'>
              Make sure your{" "}
              <code className='bg-[var(--surface-container-low)] px-1.5 py-0.5 rounded text-[11px]'>
                provider_nodes
              </code>{" "}
              table has entries with{" "}
              <code className='bg-[var(--surface-container-low)] px-1.5 py-0.5 rounded text-[11px]'>
                prefix LIKE 'prox%'
              </code>{" "}
              and their{" "}
              <code className='bg-[var(--surface-container-low)] px-1.5 py-0.5 rounded text-[11px]'>
                provider_connections
              </code>{" "}
              have valid{" "}
              <code className='bg-[var(--surface-container-low)] px-1.5 py-0.5 rounded text-[11px]'>
                apiKey
              </code>{" "}
              values.
            </p>
          </div>
        </div>
      )}

      {(!status || loading) ? (
        <div className='px-12 py-12 text-center'>
          <div className='inline-block h-6 w-6 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent' />
          <p className='mt-3 text-[13px] text-[var(--on-surface-variant)]'>
            Loading from pro-x.io.vn
          </p>
        </div>
      ) : (
        <>
          <BudgetCard
            source={{
              type: "prox",
              planType: status.plan_type,
              rateLimitAmount: status.rate_limit_amount,
              rateLimitSpent: status.rate_limit_window_spent,
              rateLimitHours: status.rate_limit_interval_hours,
              rateLimitResetsAt: status.rate_limit_window_resets_at,
              expiry: status.expiry,
              daysRemaining: status.days_remaining,
              totalSpent: status.total_spent,
            }}
          />

          {/* Quota cards */}
          <div className='grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4'>
            <QuotaCard
              label='Requests'
              value={fmt(summary?.totals.requests ?? 0)}
              sub='Total requests'
            />
            <QuotaCard
              label='Input Tokens'
              value={fmt(summary?.totals.input_tokens ?? 0)}
              sub='Prompt tokens'
            />
            <QuotaCard
              label='Output Tokens'
              value={fmt(summary?.totals.output_tokens ?? 0)}
              sub='Completion tokens'
            />
            <QuotaCard
              label='Total Cost'
              value={"$" + (summary?.totals.cost ?? 0).toFixed(2)}
              sub='Spend'
              color='#f97316'
            />
          </div>

          <ProxModelTable summary={summary?.summary ?? []} />

          <div className='grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4'>
            <ProxTimeseriesChart chart={chart} />
            <ProxRecentTable
              recent={recent}
              loading={loading}
              onPageChange={(page) => {
                api.prox
                  .getRecent(page, 15, selectedKey || undefined)
                  .then((r) => setRecent(r as ProxRecent))
                  .catch(() => {});
              }}
            />
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
