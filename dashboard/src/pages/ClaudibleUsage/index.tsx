import { useState, useEffect } from "react";
import { api } from "@/lib/api.ts";
import { RefreshCw, AlertCircle } from "lucide-react";
import { BudgetCard } from "@/components/BudgetCard.tsx";
import { QuotaCard } from "@/components/QuotaCard.tsx";
import { fmt } from "@/lib/formatters.ts";
import { CldbRecentTable } from "./components/CldbRecentTable.tsx";
import { CldbModelTable } from "./components/CldbModelTable.tsx";
import { CldbModelHub, type ModelHubResponse } from "./components/CldbModelHub.tsx";

type ProviderKey = "cldb" | "vcd";
const PROVIDER_TABS: { key: ProviderKey; label: string }[] = [
  { key: "cldb", label: "CLDB" },
  { key: "vcd", label: "VCD" },
];

// ─── Types — matching the real claudible.io /dashboard/lookup response ──────────

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

interface CldbAnalytics {
  dailyUsage: { date: string; cost: number; requests: number }[];
  modelBreakdown: { model: string; cost: number }[];
  daysRemaining: {
    runwayMinutes: number;
    avgCostPerMinute: number;
    totalActiveMinutes: number;
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
  hourlyDistribution: { hour: number; requests: number }[];
}

interface CldbStats {
  breakdownAvailableSince: string | null;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  completionTokens: number;
  inputTokensRaw: number;
  promptTokens: number;
  totalCost: number;
  totalRequests: number;
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
  stats: CldbStats;
  usage: CldbUsageItem[];
  analytics: CldbAnalytics;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Get total cost for a single usage item, summing all components if costUSD is missing */
function getUsageCost(u: CldbUsageItem): number {
  if (u.costUSD && u.costUSD > 0) return u.costUSD;
  return (
    (u.costInputUSD ?? 0) +
    (u.costOutputUSD ?? 0) +
    (u.costCacheReadUSD ?? 0) +
    (u.costCacheWriteUSD ?? 0)
  );
}

/** Sum all costs from the usage array */
function totalSpendFromUsage(usage: CldbUsageItem[]): number {
  return usage.reduce((sum, u) => sum + getUsageCost(u), 0);
}

/** Aggregate model breakdown from usage list */
function buildModelBreakdown(usage: CldbUsageItem[]) {
  const map = new Map<string, { model: string; requests: number; tokens: number; cost: number }>();
  for (const u of usage) {
    const existing = map.get(u.model) ?? { model: u.model, requests: 0, tokens: 0, cost: 0 };
    existing.requests += 1;
    existing.tokens +=
      (u.promptTokens ?? 0) +
      (u.completionTokens ?? 0) +
      (u.cacheReadTokens ?? 0) +
      (u.cacheWriteTokens ?? 0);
    existing.cost += getUsageCost(u);
    map.set(u.model, existing);
  }
  return [...map.values()].sort((a, b) => b.cost - a.cost);
}

/** Calculate subscription expiry label */
function expiresLabel(isoDate: string): string {
  const diff = new Date(isoDate).getTime() - Date.now();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Expired";
  if (days < 7) return `${days} days`;
  if (days < 30) return `${Math.ceil(days / 7)} weeks`;
  return `${Math.ceil(days / 30)} months`;
}

/** Calculate resets-in label from daily reset time */
function resetsInLabel(): string {
  const now = new Date();
  const resetUTC = new Date();
  resetUTC.setUTCHours(24, 0, 0, 0); // next midnight UTC
  const diff = resetUTC.getTime() - now.getTime();
  const h = Math.floor(diff / (1000 * 60 * 60));
  const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${h}h ${m}m`;
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function ClaudibleUsage() {
  const [provider, setProvider] = useState<ProviderKey>("cldb");
  const [data, setData] = useState<CldbLookupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [modelHub, setModelHub] = useState<ModelHubResponse | null>(null);
  const [modelHubLoading, setModelHubLoading] = useState(true);
  const [modelHubError, setModelHubError] = useState<string | null>(null);

  const providerSlug = `anthropic-compatible-${provider}`;

  const fetchData = async (p: ProviderKey) => {
    try {
      const result = (await api.dashboard.lookup(p)) as CldbLookupData;
      if (!result.valid) throw new Error("Claudible returned invalid=false");
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
    setData(null);

    fetchData(provider).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [provider]);

  useEffect(() => {
    let cancelled = false;
    setModelHubLoading(true);
    api.dashboard
      .modelHub()
      .then((res: ModelHubResponse) => {
        if (cancelled) return;
        setModelHub(res);
        setModelHubError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setModelHubError(err instanceof Error ? err.message : "Failed to load Model Hub");
      })
      .finally(() => {
        if (!cancelled) setModelHubLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData(provider);
    setRefreshing(false);
  };

  // Derived values from real data
  // Preference:
  // 1. stats.totalCost (if server provides it)
  // 2. sum of usage list (at least what we can see)
  // 3. (dailyQuota - balance) - In Claudible, if balance < quota on a daily plan, the difference is usually what was spent today.
  const sumFromList = data ? totalSpendFromUsage(data.usage) : 0;
  let totalSpend = data ? Math.max(data.stats.totalCost, sumFromList) : 0;

  if (data && totalSpend < data.dailyQuota - data.balance && data.balance < data.dailyQuota) {
    // If the inferred spend is higher than what we see in the list or stats, use it.
    totalSpend = data.dailyQuota - data.balance;
  }

  const modelBreakdown = data ? buildModelBreakdown(data.usage) : [];
  const totalCacheRead = data?.usage.reduce((s, u) => s + (u.cacheReadTokens ?? 0), 0) ?? 0;
  const totalCacheWrite = data?.usage.reduce((s, u) => s + (u.cacheWriteTokens ?? 0), 0) ?? 0;
  const totalInput = data?.usage.reduce((s, u) => s + (u.promptTokens ?? 0), 0) ?? 0;
  const totalOutput = data?.usage.reduce((s, u) => s + (u.completionTokens ?? 0), 0) ?? 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-headline text-[28px] font-700 text-(--on-surface) tracking-[-0.02em]">
            Claudible Usage
          </h1>
          <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-(--on-surface-variant) font-500">
            Upstream LLM Gateway &middot; claudible.io ({provider.toUpperCase()})
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

      {/* Provider tabs */}
      <div className="-mt-2 flex items-center gap-2">
        {PROVIDER_TABS.map((t) => {
          const active = t.key === provider;
          return (
            <button
              key={t.key}
              onClick={() => setProvider(t.key)}
              className={`h-8 px-4 rounded-full text-[12px] font-600 transition-colors border ${
                active
                  ? "bg-(--primary) text-white border-(--primary)"
                  : "bg-(--surface-container-low) text-(--on-surface) border-[rgba(203,213,225,0.6)] hover:bg-(--surface-container)"
              }`}
            >
              {t.label}
            </button>
          );
        })}
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
                {providerSlug}
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
          {/* Budget Card — balance + daily quota progress */}
          <BudgetCard
            source={{
              type: "claudible",
              balance: data.balance,
              dailyQuota: data.dailyQuota,
              dailyUsed: totalSpend,
              accountType: data.accountType,
              subscriptionExpiresAt: data.subscriptionExpiresAt,
            }}
          />

          {/* Subscription info bar (mimics claudible.io) */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              background: "var(--surface-container-lowest)",
              borderRadius: "12px",
              padding: "14px 24px",
              border: "1px solid rgba(203,213,225,0.6)",
              boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "16px" }}>⭐</span>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--on-surface)" }}>
                {data.accountType.charAt(0).toUpperCase() + data.accountType.slice(1)} Subscription
              </span>
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: "9999px",
                  background: data.subscriptionActive
                    ? "rgba(16,185,129,0.15)"
                    : "rgba(239,68,68,0.15)",
                  color: data.subscriptionActive ? "#10b981" : "#ef4444",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {data.status}
              </span>
            </div>
            <div style={{ display: "flex", gap: "32px" }}>
              <div style={{ textAlign: "right" }}>
                <p
                  style={{
                    fontSize: "10px",
                    color: "var(--on-surface-variant)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    fontWeight: 600,
                  }}
                >
                  Daily Quota
                </p>
                <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--on-surface)" }}>
                  {data.dailyQuota.toFixed(2)} credits
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p
                  style={{
                    fontSize: "10px",
                    color: "var(--on-surface-variant)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    fontWeight: 600,
                  }}
                >
                  Resets In
                </p>
                <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--on-surface)" }}>
                  {resetsInLabel()}
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p
                  style={{
                    fontSize: "10px",
                    color: "var(--on-surface-variant)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    fontWeight: 600,
                  }}
                >
                  Expires
                </p>
                <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--on-surface)" }}>
                  {expiresLabel(data.subscriptionExpiresAt)}
                </p>
              </div>
            </div>
          </div>

          {/* Quota Cards */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
            <QuotaCard
              label="Balance"
              value={`${data.balance.toFixed(2)} cr`}
              sub="Remaining credits"
              color="#0053db"
            />
            <QuotaCard
              label="Total Requests"
              value={fmt(data.stats.totalRequests || data.usage.length)}
              sub="All time (stats)"
            />
            <QuotaCard label="Input Tokens" value={fmt(totalInput)} sub="From usage list" />
            <QuotaCard label="Output Tokens" value={fmt(totalOutput)} sub="From usage list" />
            <QuotaCard label="Cache Read" value={fmt(totalCacheRead)} sub="Cache hit tokens" />
            <QuotaCard label="Cache Write" value={fmt(totalCacheWrite)} sub="Cache write tokens" />
            <QuotaCard
              label="Total Spend"
              value={"$" + totalSpend.toFixed(4)}
              sub={
                data.stats.totalCost > 0
                  ? "From account stats"
                  : totalSpend > sumFromList
                    ? "Inferred from balance"
                    : "From usage list"
              }
              color="#f97316"
            />
          </div>

          {/* Model Hub (account-independent) */}
          <CldbModelHub data={modelHub} loading={modelHubLoading} error={modelHubError} />

          {/* Model Breakdown */}
          <CldbModelTable summary={modelBreakdown} />

          {/* Recent Activity */}
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
