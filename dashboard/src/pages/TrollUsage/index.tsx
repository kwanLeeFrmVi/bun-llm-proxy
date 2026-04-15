import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api.ts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, AlertCircle, Key } from "lucide-react";
import type { TrollBilling, TrollUsageStatus, TrollSummary, TrollLogs, TrollMe } from "@/lib/trollTypes.ts";
import { BudgetCard } from "@/components/BudgetCard.tsx";
import { QuotaCardGrid } from "@/components/usage/QuotaCardGrid.tsx";
import { RpmCard } from "@/components/usage/RpmCard.tsx";
import { ApiEndpointsCard } from "@/components/usage/ApiEndpointsCard.tsx";
import { DiscordCard } from "@/components/usage/DiscordCard.tsx";
import { RequestLogTable, type RequestLogRow } from "@/components/usage/RequestLogTable.tsx";
import { fmt, fmtMs } from "@/lib/formatters.ts";

const PERIODS = [
  { label: "1h", value: "1h" },
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
];

const ENDPOINTS = [
  { label: "OPENAI COMPATIBLE", url: "https://chat.trollllm.xyz/v1" },
  { label: "ANTHROPIC COMPATIBLE", url: "https://chat.trollllm.xyz" },
];

// ─── Token Setup Banner ────────────────────────────────────────────────────────

function TokenSetupBanner({ onConfigure }: { onConfigure: () => void }) {
  return (
    <div className="flex items-center gap-4 rounded-xl bg-[var(--surface-container-low)] p-6 border border-[rgba(249,115,22,0.4)]">
      <div className="flex items-center justify-center rounded-full bg-orange-500/15 w-12 h-12 shrink-0">
        <Key className="w-6 h-6 text-orange-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-[var(--on-surface)]">TrollLLM Token Required</p>
        <p className="mt-0.5 text-[11px] text-[var(--on-surface-variant)]">
          Paste your TrollLLM session token to access the dashboard. The token is stored securely on the server and never exposed to the client.
        </p>
      </div>
      <button
        onClick={onConfigure}
        className="shrink-0 px-4 py-2 rounded-lg bg-orange-500 text-white text-[12px] font-semibold hover:bg-orange-600 transition-colors"
      >
        Configure Token
      </button>
    </div>
  );
}

// ─── Token Modal ────────────────────────────────────────────────────────────────

function TokenModal({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (token: string) => Promise<void>;
}) {
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSave = async () => {
    if (!token.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(token.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save token");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-xl bg-card border border-[rgba(203,213,225,0.6)] shadow-2xl p-6">
        <h2 className="text-[16px] font-semibold text-[var(--on-surface)]">Configure TrollLLM Token</h2>
        <p className="mt-1 text-[11px] text-[var(--on-surface-variant)]">
          Get your session token from{" "}
          <span className="font-mono text-[var(--on-surface)]">trollllm.xyz</span> — open DevTools
          (F12) → Application → Cookies → copy the <span className="font-mono">session</span> cookie value,
          or the Bearer token from the Authorization header.
        </p>
        <textarea
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="eyJhbGciOiJIUzI1NiIs..."
          className="mt-4 w-full px-3 py-2.5 rounded-lg bg-[var(--surface-container-low)] border border-[rgba(203,213,225,0.5)] text-[12px] font-mono text-[var(--on-surface)] placeholder:text-[var(--on-surface-variant)] focus:outline-none focus:border-blue-500 resize-none h-24"
        />
        {error && (
          <p className="mt-2 text-[11px] text-red-500">{error}</p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-[rgba(203,213,225,0.6)] text-[12px] text-[var(--on-surface)] hover:bg-[var(--surface-container)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !token.trim()}
            className="px-4 py-2 rounded-lg bg-orange-500 text-white text-[12px] font-semibold hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Save Token"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Credit Cards ──────────────────────────────────────────────────────────────

function CreditCard({ label, value, used, color }: { label: string; value: number; used: number; color: string }) {
  const remaining = Math.max(0, value - used);
  return (
    <div className="flex flex-col overflow-hidden rounded-xl bg-card p-4 border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-2 h-2 rounded-sm"
          style={{ background: color }}
        />
        <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--on-surface-variant)] font-600">
          {label}
        </span>
      </div>
      <p
        className="font-headline text-[24px] font-bold leading-none"
        style={{ color }}
      >
        ${remaining.toFixed(2)}
      </p>
      <p className="mt-1 text-[10px] text-[var(--on-surface-variant)]">
        Used ${used.toFixed(2)}
      </p>
    </div>
  );
}

// ─── Plan Badge ────────────────────────────────────────────────────────────────

function PlanBadge({ tier, expiresAt }: { tier: string; expiresAt: string }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="px-3 py-1.5 rounded-lg text-[12px] font-bold uppercase tracking-wider"
        style={{ background: "rgba(139,92,246,0.15)", color: "#8b5cf6" }}
      >
        {tier}
      </span>
      <span className="text-[11px] text-[var(--on-surface-variant)]">
        Exp. {new Date(expiresAt).toLocaleDateString()}
      </span>
      <span className="text-[11px] text-[var(--on-surface-variant)]">·</span>
      <span className="text-[11px] text-[var(--on-surface-variant)]">1000 VND/$1</span>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TrollUsage() {
  const [period, setPeriod] = useState("1h");
  const [tokenConfigured, setTokenConfigured] = useState<boolean | null>(null);
  const [showTokenModal, setShowTokenModal] = useState(false);

  const [billing, setBilling] = useState<TrollBilling | null>(null);
  const [status, setStatus] = useState<TrollUsageStatus | null>(null);
  const [summary, setSummary] = useState<TrollSummary | null>(null);
  const [logs, setLogs] = useState<TrollLogs | null>(null);
  const [me, setMe] = useState<TrollMe | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Check token status on mount
  useEffect(() => {
    api.troll.getTokenStatus().then((res) => {
      setTokenConfigured(res.configured);
      if (!res.configured) setLoading(false);
    }).catch(() => {
      setTokenConfigured(false);
      setLoading(false);
    });
  }, []);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [b, s, sm, l, m] = await Promise.all([
        api.troll.getBilling() as Promise<TrollBilling>,
        api.troll.getStatus() as Promise<TrollUsageStatus>,
        api.troll.getSummary(period) as Promise<TrollSummary>,
        api.troll.getLogs(period, 1, 20) as Promise<TrollLogs>,
        api.troll.getMe() as Promise<TrollMe>,
      ]);
      setBilling(b);
      setStatus(s);
      setSummary(sm);
      setLogs(l);
      setMe(m);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load TrollLLM data");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    if (tokenConfigured === false) return;
    load();
  }, [load, tokenConfigured]);

  // Auto-refresh every 60s
  useEffect(() => {
    if (tokenConfigured === false) return;
    const id = setInterval(() => load(), 60_000);
    return () => clearInterval(id);
  }, [load, tokenConfigured]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleSaveToken = async (token: string) => {
    const result = await api.troll.saveToken(token);
    if (result.success) {
      setTokenConfigured(true);
      setShowTokenModal(false);
      setLoading(true);
      load();
    }
  };

  const handleDiscordSave = async (discordId: string) => {
    await api.troll.updateDiscord(discordId);
    // Refresh me data
    const updated = await api.troll.getMe() as TrollMe;
    setMe(updated);
  };

  const handlePageChange = async (page: number) => {
    try {
      const data = await api.troll.getLogs(period, page, 20) as TrollLogs;
      setLogs(data);
    } catch {
      // silently fail on page change
    }
  };

  const logRows: RequestLogRow[] = logs?.requests.map((r) => ({
    id: r.id,
    model: r.model,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    cachedInputTokens: r.cachedInputTokens,
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

  const avgResponse = summary
    ? fmtMs(summary.avgDurationMs)
    : "—";

  const quotaItems = [
    { label: "Total Spend", value: `$${summary?.totalCost.toFixed(4) ?? "0.0000"}`, sub: "Credits used", color: "#f97316" },
    { label: "Total Requests", value: fmt(summary?.requestCount ?? 0), sub: "requests" },
    { label: "Avg Response", value: avgResponse, sub: "per request" },
    { label: "Cached Tokens", value: fmt(summary?.totalCachedTokens ?? 0), sub: "cached" },
    { label: "Input Tokens", value: fmt(summary?.inputTokens ?? 0), sub: "prompt" },
    { label: "Output Tokens", value: fmt(summary?.outputTokens ?? 0), sub: "completion" },
  ];

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

      {/* Token not configured */}
      {tokenConfigured === false && !showTokenModal && (
        <TokenSetupBanner onConfigure={() => setShowTokenModal(true)} />
      )}

      {/* Error */}
      {error && (
        <div className="flex gap-3 rounded-xl bg-[var(--surface-container-lowest)] p-6 border border-[rgba(239,68,68,0.4)]">
          <AlertCircle className="shrink-0 w-5 h-5 text-red-500" />
          <div>
            <p className="text-[13px] font-600 text-red-500">Failed to load TrollLLM data</p>
            <p className="mt-1 text-[11px] text-[var(--on-surface-variant)]">{error}</p>
          </div>
        </div>
      )}

      {/* Loading */}
      {!tokenConfigured && !billing && (loading || !tokenConfigured) && (
        <div className="px-12 py-12 text-center">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
          <p className="mt-3 text-[13px] text-[var(--on-surface-variant)]">
            {tokenConfigured === null ? "Checking configuration..." : "Loading from trollllm.xyz"}
          </p>
        </div>
      )}

      {/* Content */}
      {tokenConfigured && billing && !loading && (
        <>
          {/* Top row: Credits, Bonus, Daily Budget, RPM */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
            {status && (
              <RpmCard
                rpmUsed={status.rpm.used}
                rpmLimit={status.rpm.limit}
                concurrentUsed={status.concurrent.used}
                concurrentLimit={status.concurrent.limit}
              />
            )}
          </div>

          {/* Quota grid */}
          <QuotaCardGrid items={quotaItems} />

          {/* Plan badge */}
          {me && <PlanBadge tier={me.tier} expiresAt={billing.planExpiresAt} />}

          {/* API Endpoints + Discord in a row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ApiEndpointsCard endpoints={ENDPOINTS} />
            {me && (
              <DiscordCard
                discordId={me.discordId ?? ""}
                onSave={handleDiscordSave}
              />
            )}
          </div>

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

      {/* Token Modal */}
      <TokenModal
        open={showTokenModal}
        onClose={() => setShowTokenModal(false)}
        onSave={handleSaveToken}
      />
    </div>
  );
}
