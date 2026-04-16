import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api.ts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, AlertCircle } from "lucide-react";
import type { TrollBilling, TrollUsageStatus, TrollSummary, TrollLogs } from "@/lib/trollTypes.ts";
import { BudgetCard } from "@/components/BudgetCard.tsx";
import { QuotaCard } from "@/components/QuotaCard.tsx";
import { RpmCard } from "@/components/usage/RpmCard.tsx";
import { RequestLogTable, type RequestLogRow } from "@/components/usage/RequestLogTable.tsx";
import { TrollTimeseriesChart } from "./components/TrollTimeseriesChart.tsx";
import { fmt, fmtMs } from "@/lib/formatters.ts";

const PERIODS = [
  { label: "1h", value: "1h" },
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
];

// ─── Credit Cards ──────────────────────────────────────────────────────────────

function CreditCard({
  label,
  value,
  used,
  color,
}: {
  label: string;
  value: number;
  used: number;
  color: string;
}) {
  const remaining = Math.max(0, value - used);
  return (
    <div className="flex flex-col overflow-hidden rounded-xl bg-card p-4 border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-sm" style={{ background: color }} />
        <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--on-surface-variant)] font-600">
          {label}
        </span>
      </div>
      <p className="font-headline text-[24px] font-bold leading-none" style={{ color }}>
        ${remaining.toFixed(2)}
      </p>
      <p className="mt-1 text-[10px] text-[var(--on-surface-variant)]">Used ${used.toFixed(2)}</p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TrollUsage() {
  const [period, setPeriod] = useState("24h");

  const [billing, setBilling] = useState<TrollBilling | null>(null);
  const [status, setStatus] = useState<TrollUsageStatus | null>(null);
  const [summary, setSummary] = useState<TrollSummary | null>(null);
  const [logs, setLogs] = useState<TrollLogs | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [b, s, sm, l] = await Promise.all([
        api.troll.getBilling() as Promise<TrollBilling>,
        api.troll.getStatus() as Promise<TrollUsageStatus>,
        api.troll.getSummary(period) as Promise<TrollSummary>,
        api.troll.getLogs(period, 1, 20) as Promise<TrollLogs>,
      ]);
      setBilling(b);
      setStatus(s);
      setSummary(sm);
      setLogs(l);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load TrollLLM data");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh every 60s
  useEffect(() => {
    const id = setInterval(() => {
      if (!refreshing) load();
    }, 60_000);
    return () => clearInterval(id);
  }, [load, refreshing]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handlePageChange = async (page: number) => {
    try {
      const data = (await api.troll.getLogs(period, page, 20)) as TrollLogs;
      setLogs(data);
    } catch {
      // silently fail on page change
    }
  };

  const logRows: RequestLogRow[] =
    logs?.requests.map((r) => ({
      id: r.id,
      model: r.model,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      cachedInputTokens: r.cachedInputTokens,
      cacheWriteTokens: r.cacheWriteTokens,
      cacheHitTokens: r.cacheHitTokens,
      creditsCost: r.creditsCost,
      durationMs: r.durationMs,
      isStream: r.isStream,
      statusCode: r.statusCode,
      isSuccess: r.isSuccess,
      endpoint: r.endpoint,
      discountLabel: r.discountLabel,
      errorMessage: r.errorMessage,
      createdAt: r.createdAt,
    })) ?? [];

  const avgResponse = summary ? fmtMs(summary.avgDurationMs) : "—";

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-headline text-[28px] font-700 text-[var(--on-surface)] tracking-[-0.02em]">
            TrollLLM Usage
          </h1>
          <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-[var(--on-surface-variant)] font-500">
            Upstream LLM Gateway &middot; trollllm.xyz
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Tabs value={period} onValueChange={(v) => setPeriod(v)}>
            <TabsList className="h-9 bg-[var(--surface-container-low)] rounded-lg p-1">
              {PERIODS.map((p) => (
                <TabsTrigger
                  key={p.value}
                  value={p.value}
                  className="h-7 px-3 rounded-md text-[12px] font-500"
                >
                  {p.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="h-9 px-4 flex items-center gap-2 rounded-md border border-[rgba(203,213,225,0.6)] bg-[var(--surface-container-low)] text-[var(--on-surface)] text-[12px] font-500 hover:bg-[var(--surface-container)] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </div>

      {lastUpdated && (
        <p className="-mt-2 text-[11px] text-[var(--on-surface-variant)]">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </p>
      )}

      {error && (
        <div className="flex gap-3 rounded-xl bg-[var(--surface-container-lowest)] p-6 border border-[rgba(239,68,68,0.4)]">
          <AlertCircle className="shrink-0 w-5 h-5 text-[#ef4444]" />
          <div>
            <p className="text-[13px] font-600 text-[#ef4444]">Failed to load TrollLLM data</p>
            <p className="mt-1 text-[11px] text-[var(--on-surface-variant)]">{error}</p>
            <p className="mt-1 text-[11px] text-[var(--on-surface-variant)]">
              Make sure{" "}
              <code className="bg-[var(--surface-container-low)] px-1.5 py-0.5 rounded text-[11px]">
                TROLL_USAGE_TOKEN
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

      {!billing || loading ? (
        <div className="px-12 py-12 text-center">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
          <p className="mt-3 text-[13px] text-[var(--on-surface-variant)]">
            Loading from trollllm.xyz
          </p>
        </div>
      ) : (
        <>
          {/* Top row: BudgetCard full width */}
          <BudgetCard
            source={{
              type: "troll",
              tier: billing.tier,
              credits: billing.credits,
              creditsUsed: billing.creditsUsed,
              creditsBonus: billing.creditsBonus,
              creditsBonusUsed: billing.creditsBonusUsed,
              planDailyAllocation: billing.planDailyAllocation,
              planDailyUsed: billing.planDailyUsed,
              planDailyResetDate: billing.planDailyResetDate,
              planExpiresAt: billing.planExpiresAt,
            }}
          />

          {/* Second row: RPM, Total Spend, Total Requests */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {status && (
              <RpmCard
                rpmUsed={status.rpm.used}
                rpmLimit={status.rpm.limit}
                concurrentUsed={status.concurrent.used}
                concurrentLimit={status.concurrent.limit}
              />
            )}
            <QuotaCard
              label="Total Spend"
              value={`$${summary?.totalCost.toFixed(4) ?? "0.0000"}`}
              sub="Credits used"
              color="#f97316"
            />
            <QuotaCard
              label="Total Requests"
              value={String(summary?.requestCount ?? 0)}
              sub="requests"
            />
          </div>

          {/* Third row: Credits, Bonus, Avg Response, Cached, Input, Output */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
            <CreditCard
              label="CREDITS"
              value={billing.credits}
              used={billing.creditsUsed}
              color="#3b82f6"
            />
            <CreditCard
              label="BONUS"
              value={billing.creditsBonus}
              used={billing.creditsBonusUsed}
              color="#f97316"
            />
            <QuotaCard label="Avg Response" value={avgResponse} sub="per request" />
            <QuotaCard
              label="Cached Tokens"
              value={fmt(summary?.totalCachedTokens ?? 0)}
              sub="cached"
            />
            <QuotaCard
              label="Input Tokens"
              value={fmt(summary?.inputTokens ?? 0)}
              sub="prompt"
            />
            <QuotaCard
              label="Output Tokens"
              value={fmt(summary?.outputTokens ?? 0)}
              sub="completion"
            />
          </div>

          {/* Timeseries chart */}
          <TrollTimeseriesChart logs={logs} />

          {/* Request History Table */}
          {logs && (
            <RequestLogTable
              rows={logRows}
              loading={loading}
              pagination={
                logs.totalPages > 1
                  ? { page: logs.page, totalPages: logs.totalPages, total: logs.total }
                  : undefined
              }
              onPageChange={handlePageChange}
            />
          )}
        </>
      )}
    </div>
  );
}
