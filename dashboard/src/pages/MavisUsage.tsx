import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, AlertCircle } from "lucide-react";
import type { MavisUsageResponse, MavisUserProfile } from "@/lib/mavisTypes.ts";

// ─── Types (mirror the mavisService.ts interfaces) ─────────────────────────────

interface ModelPricingMap {
  [model: string]: { input_ratio: number; output_ratio: number };
}

function buildPricingMap(pricing: MavisUsageResponse["model_pricing"]): ModelPricingMap {
  const map: ModelPricingMap = {};
  for (const p of pricing) {
    map[p.model] = { input_ratio: p.input_ratio, output_ratio: p.output_ratio };
  }
  return map;
}

function estimateCost(
  inputTokens: number,
  outputTokens: number,
  pricing: ModelPricingMap[string],
): number {
  if (!pricing) return 0;
  return (inputTokens * pricing.input_ratio + outputTokens * pricing.output_ratio) / 1_000_000;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────────

const RANGES = ["24h", "7d", "30d", "all"] as const;
type Range = (typeof RANGES)[number];

const cardStyle =
  "bg-[--surface-container-lowest] rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)] overflow-hidden";

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function quotaPercent(used: number, total: number): number {
  if (!total) return 0;
  return Math.min(100, Math.round((used / total) * 100));
}

// ─── Quota Overview Cards ───────────────────────────────────────────────────────

function QuotaCards({ profile, usage }: { profile: MavisUserProfile | null; usage: MavisUsageResponse | null }) {
  const quota = profile?.quota ?? usage?.quota ?? 0;
  const usedQuota = profile?.usedQuota ?? usage?.used_quota ?? 0;
  const usedReq = usage?.summary?.total_requests ?? 0;
  const resetAt = profile?.periodResetAt ?? usage?.period_reset_at ?? "";
  const planName = profile?.planName ?? usage?.plan_name ?? "—";
  const allowance = profile?.planAllowance ?? usage?.plan_allowance ?? 0;
  const pct = quotaPercent(usedQuota, quota);

  return (
    <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
      <div className={cardStyle + " p-6"}>
        <p className='text-xs uppercase tracking-[0.12em] text-[--on-surface-variant] font-semibold'>
          Plan
        </p>
        <p className='text-3xl font-bold font-headline mt-1 tracking-tight text-[--on-surface]'>
          {planName}
        </p>
        <p className='text-xs text-[--on-surface-variant] mt-1'>Current plan</p>
      </div>

      <div className={cardStyle + " p-6"}>
        <p className='text-xs uppercase tracking-[0.12em] text-[--on-surface-variant] font-semibold'>
          Quota Used
        </p>
        <p className='text-3xl font-bold font-headline mt-1 tracking-tight text-[--primary]'>
          {fmt(usedQuota)}
        </p>
        <p className='text-xs text-[--on-surface-variant] mt-1">
          of {fmt(quota)} (~{fmt(allowance)} allowance)
        </p>
        {/* Progress bar */}
        <div className='mt-3 h-1.5 rounded-full bg-[rgba(203,213,225,0.3)] overflow-hidden'>
          <div
            className='h-full rounded-full transition-all duration-500'
            style={{
              width: `${pct}%`,
              background: pct > 80 ? "#ef4444" : pct > 50 ? "#f59e0b" : "#22c55e",
            }}
          />
        </div>
        <p className='text-xs text-[--on-surface-variant] mt-1'>{pct}% used</p>
      </div>

      <div className={cardStyle + " p-6"}>
        <p className='text-xs uppercase tracking-[0.12em] text-[--on-surface-variant] font-semibold'>
          Requests
        </p>
        <p className='text-3xl font-bold font-headline mt-1 tracking-tight text-[--on-surface]'>
          {fmt(usedReq)}
        </p>
        <p className='text-xs text-[--on-surface-variant] mt-1'>
          {usage?.summary?.success_count ?? 0} success / {usage?.summary?.failure_count ?? 0} failed
        </p>
      </div>

      <div className={cardStyle + " p-6"}>
        <p className='text-xs uppercase tracking-[0.12em] text-[--on-surface-variant] font-semibold'>
          Reset Date
        </p>
        <p className='text-lg font-bold font-headline mt-1 tracking-tight text-[--on-surface] leading-tight'>
          {fmtDate(resetAt)}
        </p>
        <p className='text-xs text-[--on-surface-variant] mt-1'>
          {profile?.planPeriod ?? usage?.plan_period ?? ""} period
        </p>
      </div>
    </div>
  );
}

// ─── Usage by Model Table ───────────────────────────────────────────────────────

function ModelUsageTable({
  usage,
  pricing,
}: {
  usage: MavisUsageResponse | null;
  pricing: ModelPricingMap;
}) {
  const models = usage?.models ?? [];
  const totalTokens = usage?.summary?.total_tokens ?? 0;

  if (models.length === 0) {
    return (
      <div className={cardStyle + " p-10 text-center text-sm text-[--on-surface-variant]"}>
        No model data available.
      </div>
    );
  }

  return (
    <div className={cardStyle}>
      <div className='px-6 py-4 border-b border-[rgba(203,213,225,0.4)]'>
        <p className='text-sm font-semibold text-[--on-surface]'>Usage by Model</p>
        <p className='text-xs text-[--on-surface-variant] mt-0.5'>
          Token breakdown and estimated cost per model
        </p>
      </div>
      <Table stickyHeader>
        <TableHeader>
          <TableRow className='border-b border-[rgba(203,213,225,0.4)]'>
            <TableHead className='uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 pl-6'>
              Model
            </TableHead>
            <TableHead className='uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 text-right'>
              Requests
            </TableHead>
            <TableHead className='uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 text-right hidden sm:table-cell'>
              Input Tokens
            </TableHead>
            <TableHead className='uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 text-right hidden sm:table-cell'>
              Output Tokens
            </TableHead>
            <TableHead className='uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 text-right hidden md:table-cell'>
              Cached
            </TableHead>
            <TableHead className='uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 text-right hidden md:table-cell'>
              Failures
            </TableHead>
            <TableHead className='uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 text-right'>
              Est. Cost
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {models.map((m, i) => {
            const cost = estimateCost(m.input_tokens, m.output_tokens, pricing[m.model]);
            const share = totalTokens > 0 ? (m.total_tokens / totalTokens) * 100 : 0;
            return (
              <TableRow
                key={m.model}
                className={
                  "border-b border-[rgba(203,213,225,0.25)] hover:bg-[--surface-container-low]/50 transition-colors" +
                  (i % 2 === 1 ? " bg-[--surface-container-low]/40" : "")
                }
              >
                <TableCell className='pl-6 py-3'>
                  <div>
                    <Badge variant='endpoint'>{m.model}</Badge>
                    {share > 20 && (
                      <div className='mt-1.5 h-1 w-full rounded-full bg-[rgba(34,197,94,0.25)] overflow-hidden'>
                        <div
                          className='h-full rounded-full bg-green-500'
                          style={{ width: `${share}%` }}
                        />
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className='text-sm text-right tabular-nums text-[--on-surface] py-3'>
                  {m.requests.toLocaleString()}
                </TableCell>
                <TableCell className='text-sm text-right tabular-nums text-[--primary] py-3 hidden sm:table-cell'>
                  {m.input_tokens.toLocaleString()}
                </TableCell>
                <TableCell className='text-sm text-right tabular-nums text-[--on-surface] py-3 hidden sm:table-cell'>
                  {m.output_tokens.toLocaleString()}
                </TableCell>
                <TableCell className='text-sm text-right tabular-nums text-[--on-surface-variant] py-3 hidden md:table-cell'>
                  {m.cached_tokens > 0 ? fmt(m.cached_tokens) : "—"}
                </TableCell>
                <TableCell className='text-sm text-right tabular-nums py-3 hidden md:table-cell'>
                  {m.failures > 0 ? (
                    <span className='text-red-500'>{m.failures}</span>
                  ) : (
                    <span className='text-[--on-surface-variant]'>0</span>
                  )}
                </TableCell>
                <TableCell className='text-sm text-right tabular-nums text-[--on-surface] py-3'>
                  ${cost.toFixed(4)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Timeseries Bar Chart ───────────────────────────────────────────────────────

function TimeseriesChart({
  usage,
}: {
  usage: MavisUsageResponse | null;
}) {
  const ts = usage?.timeseries ?? [];

  if (ts.length === 0) {
    return (
      <div className={cardStyle + " p-10 text-center text-sm text-[--on-surface-variant]"}>
        No timeseries data available.
      </div>
    );
  }

  const maxTokens = Math.max(...ts.map((d) => d.tokens), 1);

  return (
    <div className={cardStyle}>
      <div className='px-6 py-4 border-b border-[rgba(203,213,225,0.4)]'>
        <p className='text-sm font-semibold text-[--on-surface]'>Token Usage Over Time</p>
        <p className='text-xs text-[--on-surface-variant] mt-0.5'>
          Daily tokens and request volume
        </p>
      </div>
      <div className='px-6 py-5'>
        {/* Bar chart */}
        <div className='flex items-end gap-2 h-40'>
          {ts.map((d, i) => {
            const h = Math.max(2, Math.round((d.tokens / maxTokens) * 160));
            const hReq = Math.max(2, Math.round((d.requests / (maxTokens / 100)) * 160));
            return (
              <div key={i} className='flex-1 flex flex-col items-center gap-1 group relative'>
                {/* Tooltip */}
                <div className='absolute bottom-full mb-2 hidden group-hover:block bg-[--surface-container-lowest] border border-[rgba(203,213,225,0.6)] rounded-lg px-3 py-2 text-xs z-10 whitespace-nowrap shadow-lg'>
                  <p className='font-semibold text-[--on-surface]'>{d.time}</p>
                  <p className='text-[--primary]'>Tokens: {d.tokens.toLocaleString()}</p>
                  <p className='text-[--on-surface-variant]'>Requests: {d.requests.toLocaleString()}</p>
                  <p className='text-red-400'>Failures: {d.failures}</p>
                </div>
                {/* Token bar */}
                <div
                  className='w-full rounded-t bg-[--primary] opacity-80 hover:opacity-100 transition-opacity'
                  style={{ height: h }}
                  title={`Tokens: ${d.tokens.toLocaleString()}`}
                />
                {/* Request bar (scaled) */}
                <div
                  className='w-full rounded-t bg-[--on-surface-variant] opacity-40'
                  style={{ height: hReq }}
                />
              </div>
            );
          })}
        </div>
        {/* X-axis labels */}
        <div className='flex gap-2 mt-2'>
          {ts.map((d, i) => (
            <div key={i} className='flex-1 text-center'>
              <span className='text-[10px] text-[--on-surface-variant]'>
                {d.time.slice(5)}
              </span>
            </div>
          ))}
        </div>
        {/* Legend */}
        <div className='flex items-center gap-4 mt-4'>
          <div className='flex items-center gap-1.5'>
            <div className='w-3 h-3 rounded bg-[--primary] opacity-80' />
            <span className='text-xs text-[--on-surface-variant]'>Tokens</span>
          </div>
          <div className='flex items-center gap-1.5'>
            <div className='w-3 h-3 rounded bg-[--on-surface-variant] opacity-40' />
            <span className='text-xs text-[--on-surface-variant]'>Requests × 100</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Model Pricing Table ───────────────────────────────────────────────────────

function PricingTable({ usage }: { usage: MavisUsageResponse | null }) {
  const pricing = usage?.model_pricing ?? [];

  if (pricing.length === 0) {
    return null;
  }

  return (
    <div className={cardStyle}>
      <div className='px-6 py-4 border-b border-[rgba(203,213,225,0.4)]'>
        <p className='text-sm font-semibold text-[--on-surface]'>Model Pricing Ratios</p>
        <p className='text-xs text-[--on-surface-variant] mt-0.5'>
          Input/output ratio used for cost estimation
        </p>
      </div>
      <Table stickyHeader>
        <TableHeader>
          <TableRow className='border-b border-[rgba(203,213,225,0.4)]'>
            <TableHead className='uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 pl-6'>
              Model
            </TableHead>
            <TableHead className='uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 text-right'>
              Input Ratio
            </TableHead>
            <TableHead className='uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 text-right pr-6'>
              Output Ratio
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pricing.map((p, i) => (
            <TableRow
              key={p.model}
              className={
                "border-b border-[rgba(203,213,225,0.25)] hover:bg-[--surface-container-low]/50 transition-colors" +
                (i % 2 === 1 ? " bg-[--surface-container-low]/40" : "")
              }
            >
              <TableCell className='pl-6 py-3'>
                <Badge variant='secondary'>{p.model}</Badge>
              </TableCell>
              <TableCell className='text-sm text-right tabular-nums text-[--primary] py-3'>
                {p.input_ratio}
              </TableCell>
              <TableCell className='text-sm text-right tabular-nums text-[--on-surface] py-3 pr-6'>
                {p.output_ratio}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Root Component ─────────────────────────────────────────────────────────────

export default function MavisUsage() {
  const [range, setRange] = useState<Range>("7d");
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
      setError(err instanceof Error ? err.message : "Failed to load data from Mavis");
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

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const id = setInterval(() => {
      if (!refreshing) load();
    }, 60_000);
    return () => clearInterval(id);
  }, [load, refreshing]);

  const pricing = usage ? buildPricingMap(usage.model_pricing) : {};

  return (
    <div className='space-y-6'>
      {/* Page Header */}
      <div className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4'>
        <div>
          <h1 className='font-headline text-2xl sm:text-3xl font-bold tracking-tight text-[--on-surface]'>
            Mavis Usage
          </h1>
          <p className='text-xs uppercase tracking-[0.12em] text-[--on-surface-variant] mt-1 sm:mt-1.5 font-medium'>
            Upstream LLM Gateway · mavis.io.vn
          </p>
        </div>

        <div className='flex items-center gap-3'>
          {/* Range selector */}
          <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
            <TabsList className='h-8 sm:h-9 bg-[--surface-container-low] rounded-lg p-1'>
              {RANGES.map((r) => (
                <TabsTrigger
                  key={r}
                  value={r}
                  className='h-6 sm:h-7 px-2 sm:px-3 rounded text-xs sm:text-sm font-medium data-[state=active]:bg-[--surface-container-lowest] data-[state=active]:shadow-sm'
                >
                  {r}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {/* Refresh button */}
          <Button
            variant='outline'
            size='sm'
            onClick={handleRefresh}
            disabled={refreshing}
            className='h-8 sm:h-9'
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5${refreshing ? " animate-spin" : ""}`} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Last updated */}
      {lastUpdated && (
        <p className='text-xs text-[--on-surface-variant] -mt-4'>
          Last updated: {lastUpdated.toLocaleTimeString()}
        </p>
      )}

      {/* Error state */}
      {error && (
        <div className={cardStyle + " p-6 flex items-start gap-3"}>
          <AlertCircle className='w-5 h-5 text-red-500 shrink-0 mt-0.5' />
          <div>
            <p className='text-sm font-semibold text-red-500'>Failed to load Mavis data</p>
            <p className='text-xs text-[--on-surface-variant] mt-1'>{error}</p>
            <p className='text-xs text-[--on-surface-variant] mt-1'>
              Make sure <code className='text-xs bg-[--surface-container-low] px-1 py-0.5 rounded'>MAVIS_USERNAME</code> and{" "}
              <code className='text-xs bg-[--surface-container-low] px-1 py-0.5 rounded'>MAVIS_PASSWORD</code> are set in your{" "}
              <code className='text-xs bg-[--surface-container-low] px-1 py-0.5 rounded'>.env</code> file.
            </p>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && !usage ? (
        <div className='p-12 text-center'>
          <div className='inline-block w-6 h-6 border-2 border-[--primary] border-t-transparent rounded-full animate-spin' />
          <p className='text-sm text-[--on-surface-variant] mt-3'>Loading from mavis.io.vn…</p>
        </div>
      ) : (
        <>
          {/* Quota Cards */}
          <QuotaCards profile={profile} usage={usage} />

          {/* Usage by Model Table */}
          <ModelUsageTable usage={usage} pricing={pricing} />

          {/* Timeseries Chart + Model Breakdown Side by Side */}
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
            <TimeseriesChart usage={usage} />
            <PricingTable usage={usage} />
          </div>
        </>
      )}
    </div>
  );
}
