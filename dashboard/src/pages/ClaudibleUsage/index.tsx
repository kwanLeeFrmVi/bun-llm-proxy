import { useState, useEffect } from "react";
import { api } from "@/lib/api.ts";
import { RefreshCw, AlertCircle } from "lucide-react";
import { BudgetCard } from "@/components/BudgetCard.tsx";
import { QuotaCard } from "@/components/QuotaCard.tsx";
import { fmt } from "@/lib/formatters.ts";
import { CldbRecentTable } from "./components/CldbRecentTable.tsx";
import { CldbModelTable } from "./components/CldbModelTable.tsx";

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface CldbUsageItem {
  id: number;
  model: string;
  promptTokens: number;
  completionTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUSD: number;
  costInputUSD: number;
  costOutputUSD: number;
  costCacheReadUSD: number;
  costCacheWriteUSD: number;
  createdAt: string;
  hasBreakdown: boolean;
}

interface CldbLookupData {
  valid: boolean;
  balance: number;
  status: string;
  createdAt: string;
  accountType: string;
  dailyQuota: number;
  subscriptionExpiresAt: string;
  subscriptionActive: boolean;
  userEmail: string;
  userName: string;
  stats: {
    totalRequests: number;
    totalCost: number;
    promptTokens: number;
    completionTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
  usage: CldbUsageItem[];
  analytics: {
    modelBreakdown: { model: string; requests: number; tokens: number; cost: number }[];
    daysRemaining: {
      currentBalance: number;
      daysRemaining: number;
      avgDailyCost7d: number;
      avgDailyCost30d: number;
    };
    tokenEfficiency: {
      avgTokensPerRequest: number;
      avgInputTokens: number;
      avgOutputTokens: number;
      inputOutputRatio: number;
      totalRequests: number;
    };
  };
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function ClaudibleUsage() {
  const [data, setData] = useState<CldbLookupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = async () => {
    try {
      const { connections } = await api.providers.list();
      const cldbConn = connections.find((c) => c.provider === "anthropic-compatible-cldb");
      const result = (await api.dashboard.lookup(
        (cldbConn?.apiKey as string) || "sk-placeholder"
      )) as CldbLookupData;
      setData(result);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Claudible data");
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchData().finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-headline text-[28px] font-700 text-(--on-surface) tracking-[-0.02em]">
            Claudible Usage
          </h1>
          <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-(--on-surface-variant) font-500">
            Upstream LLM Gateway &middot; claudible.io
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="h-9 px-4 flex items-center gap-2 rounded-md border border-[rgba(203,213,225,0.6)] bg-(--surface-container-low) text-(--on-surface) text-[12px] font-500 hover:bg-(--surface-container) transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </div>

      {lastUpdated && (
        <p className="-mt-2 text-[11px] text-(--on-surface-variant)">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </p>
      )}

      {error && (
        <div className="flex gap-3 rounded-xl bg-(--surface-container-lowest) p-6 border border-[rgba(203,213,225,0.6)]">
          <AlertCircle className="shrink-0 w-5 h-5 text-[#ef4444]" />
          <div>
            <p className="text-[13px] font-600 text-[#ef4444]">Failed to load Claudible data</p>
            <p className="mt-1 text-[11px] text-(--on-surface-variant)">{error}</p>
            <p className="mt-1 text-[11px] text-(--on-surface-variant)">
              Make sure your{" "}
              <code className="bg-(--surface-container-low) px-1.5 py-0.5 rounded text-[11px]">
                provider_connections
              </code>{" "}
              table has an entry with provider{" "}
              <code className="bg-(--surface-container-low) px-1.5 py-0.5 rounded text-[11px]">
                anthropic-compatible-cldb
              </code>{" "}
              and a valid{" "}
              <code className="bg-(--surface-container-low) px-1.5 py-0.5 rounded text-[11px]">
                apiKey
              </code>
              .
            </p>
          </div>
        </div>
      )}

      {!data || loading ? (
        <div className="px-12 py-12 text-center">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-(--primary) border-t-transparent" />
          <p className="mt-3 text-[13px] text-(--on-surface-variant)">Loading from claudible.io</p>
        </div>
      ) : (
        <>
          {/* Budget Card */}
          <BudgetCard
            source={{
              type: "troll",
              tier: data.accountType,
              credits: data.balance,
              creditsUsed: data.stats.totalCost,
              creditsBonus: 0,
              creditsBonusUsed: 0,
              planDailyAllocation: data.dailyQuota,
              planDailyUsed: data.stats.totalCost,
              planDailyResetDate: new Date(Date.now() + 11 * 60 * 60 * 1000).toISOString(),
              planExpiresAt: data.subscriptionExpiresAt,
            }}
          />

          {/* Quota Cards */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
            <QuotaCard
              label="Balance"
              value={`${data.balance.toFixed(2)} cr`}
              sub="Remaining credits"
              color="#0053db"
            />
            <QuotaCard
              label="Total Requests"
              value={fmt(data.stats.totalRequests)}
              sub="All time"
            />
            <QuotaCard
              label="Input Tokens"
              value={fmt(data.stats.promptTokens)}
              sub="Prompt tokens"
            />
            <QuotaCard
              label="Output Tokens"
              value={fmt(data.stats.completionTokens)}
              sub="Completion tokens"
            />
            <QuotaCard
              label="Cache Read"
              value={fmt(data.stats.cacheReadTokens)}
              sub="Cache hit tokens"
            />
            <QuotaCard
              label="Total Cost"
              value={"$" + data.stats.totalCost.toFixed(2)}
              sub="Spend"
              color="#f97316"
            />
          </div>

          {/* Model Breakdown */}
          <CldbModelTable summary={data.analytics.modelBreakdown} />

          {/* Recent Table */}
          <CldbRecentTable usage={data.usage} loading={loading} />
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
