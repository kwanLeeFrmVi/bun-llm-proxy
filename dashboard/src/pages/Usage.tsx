import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api.ts";
import type { UsageStats, UsageRecord, ApiKeyRecord } from "@/lib/types.ts";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ProviderTopology } from "@/components/ProviderTopology";
import { PaginationControls } from "@/components/PaginationControls";
import { ExternalLink, SlidersHorizontal, X } from "lucide-react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const PERIODS = ["24h", "7d", "30d", "all"] as const;
type Period = (typeof PERIODS)[number];

const VIEW_OPTIONS = [
  { value: "model", label: "Usage by Model" },
  { value: "provider", label: "Usage by Provider" },
  { value: "apikey", label: "Usage by API Key" },
] as const;
type ViewOption = (typeof VIEW_OPTIONS)[number]["value"];

const cardStyle =
  "bg-[--surface-container-lowest] rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)] overflow-hidden";

const CHART_COLORS = [
  "rgba(0,83,219,0.8)",
  "rgba(97,139,255,0.8)",
  "rgba(34,197,94,0.8)",
  "rgba(245,158,11,0.8)",
  "rgba(239,68,68,0.8)",
  "rgba(139,92,246,0.8)",
  "rgba(20,184,166,0.8)",
  "rgba(249,115,22,0.8)",
  "rgba(236,72,153,0.8)",
  "rgba(16,185,129,0.8)",
];

type BreakdownRow = {
  key: string;
  label: string;
  requests: number;
  tokens: number;
  cost: number;
};

function BreakdownChart({
  rows,
  view,
}: {
  rows: BreakdownRow[];
  view: ViewOption;
}) {
  const top = rows.slice(0, 10);
  if (top.length === 0) return null;

  const isApiKey = view === "apikey";
  const metric = isApiKey ? "Requests" : "Tokens";
  const values = isApiKey
    ? top.map((r) => r.requests)
    : top.map((r) => r.tokens);
  const labels = top.map((r) =>
    r.label.length > 28 ? r.label.slice(0, 28) + "\u2026" : r.label,
  );

  const data = {
    labels,
    datasets: [
      {
        label: metric,
        data: values,
        backgroundColor: CHART_COLORS.slice(0, top.length),
        borderRadius: 4,
      },
    ],
  };

  const options = {
    indexAxis: "y" as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: {
            parsed: { x: number | null };
            dataset: { label?: string };
          }) =>
            ` ${ctx.dataset.label}: ${(ctx.parsed.x ?? 0).toLocaleString()}`,
        },
      },
    },
    scales: {
      x: {
        grid: { color: "rgba(203,213,225,0.2)" },
        ticks: {
          font: { size: 11 },
          color: "#64748b",
          callback: (v: number | string) => fmt(Number(v)),
        },
      },
      y: {
        grid: { display: false },
        ticks: { font: { size: 11 }, color: "#64748b" },
      },
    },
  };

  const title =
    view === "model"
      ? "Tokens by Model"
      : view === "provider"
        ? "Tokens by Provider"
        : "Requests by API Key";

  return (
    <div className={cardStyle}>
      <div className='px-6 py-4 border-b border-[rgba(203,213,225,0.4)]'>
        <p className='text-sm font-semibold text-[--on-surface]'>{title}</p>
        <p className='text-xs text-[--on-surface-variant] mt-0.5'>
          Top {top.length} — visual breakdown
        </p>
      </div>
      <div
        style={{
          height: `${Math.max(180, top.length * 34)}px`,
          padding: "16px 24px",
        }}
      >
        <Bar data={data} options={options} />
      </div>
    </div>
  );
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

function relTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function StatusBadge({ status }: { status: string }) {
  const ok = status === "success" || status === "200";
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full ${
        ok
          ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
          : "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-green-500" : "bg-red-500"}`}
      />
      {status}
    </span>
  );
}

// ─── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({
  period,
  stats,
  recentRows,
  apiKeyMap,
}: {
  period: Period;
  stats: UsageStats;
  recentRows: UsageRecord[];
  apiKeyMap: Map<string, string>;
}) {
  const s = stats;
  const [view, setView] = useState<ViewOption>("model");

  const tableRows = (() => {
    if (view === "model")
      return s.byModel.map((r) => ({
        key: r.model,
        label: r.model,
        requests: r.requests,
        tokens: r.tokens,
        cost: r.cost,
      }));
    if (view === "provider")
      return s.byProvider.map((r) => ({
        key: r.provider,
        label: r.provider,
        requests: r.requests,
        tokens: r.tokens ?? 0,
        cost: r.cost,
      }));
    // apikey
    return s.byApiKey.map((r) => ({
      key: r.apiKeyId,
      label: apiKeyMap.get(r.apiKeyId) ?? r.apiKeyId,
      requests: r.requests,
      tokens: 0,
      cost: r.cost,
    }));
  })();

  return (
    <div className='space-y-6'>
      {/* Summary Stat Cards */}
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        <div className={cardStyle + " p-6"}>
          <p className='text-xs uppercase tracking-[0.12em] text-[--on-surface-variant] font-semibold'>
            Total Requests
          </p>
          <p className='text-3xl font-bold font-headline mt-1 tracking-tight text-[--on-surface]'>
            {fmt(s.totalRequests)}
          </p>
          <p className='text-xs text-[--on-surface-variant] mt-1'>
            {period} window
          </p>
        </div>
        <div className={cardStyle + " p-6"}>
          <p className='text-xs uppercase tracking-[0.12em] text-[--on-surface-variant] font-semibold'>
            Input Tokens
          </p>
          <p className='text-3xl font-bold font-headline mt-1 tracking-tight text-[--primary]'>
            {fmt(s.totalPromptTokens)}
          </p>
          <p className='text-xs text-[--on-surface-variant] mt-1'>
            Prompt / context
          </p>
        </div>
        <div className={cardStyle + " p-6"}>
          <p className='text-xs uppercase tracking-[0.12em] text-[--on-surface-variant] font-semibold'>
            Output Tokens
          </p>
          <p className='text-3xl font-bold font-headline mt-1 tracking-tight text-[--on-surface]'>
            {fmt(s.totalCompletionTokens)}
          </p>
          <p className='text-xs text-[--on-surface-variant] mt-1'>
            Generated output
          </p>
        </div>
        <div className={cardStyle + " p-6"}>
          <p className='text-xs uppercase tracking-[0.12em] text-[--on-surface-variant] font-semibold'>
            Est. Cost
          </p>
          <p className='text-3xl font-bold font-headline mt-1 tracking-tight text-[--on-surface]'>
            ~${s.totalCost.toFixed(2)}
          </p>
          <p className='text-xs text-[--on-surface-variant] mt-1'>
            Estimated, not actual billing
          </p>
        </div>
      </div>

      {/* Breakdown Chart */}
      <BreakdownChart rows={tableRows} view={view} />

      {/* Network Graph + Recent Requests */}
      <div className='grid grid-cols-1 lg:grid-cols-5 gap-4'>
        {/* Network Graph */}
        <div className={cardStyle + " lg:col-span-3"}>
          <div className='px-6 py-4 border-b border-[rgba(203,213,225,0.4)]'>
            <p className='text-sm font-semibold text-[--on-surface]'>
              Token Traffic Orchestration
            </p>
            <p className='text-xs text-[--on-surface-variant] mt-0.5'>
              Aggregate usage across all active gateways
            </p>
          </div>
          <ProviderTopology
            providers={stats.byProvider}
            lastProvider={recentRows[0]?.provider}
          />
        </div>

        {/* Recent Requests */}
        <div className={cardStyle + " lg:col-span-2 flex flex-col"}>
          <div className='px-5 py-4 border-b border-[rgba(203,213,225,0.4)]'>
            <p className='text-sm font-semibold text-[--on-surface]'>
              Recent Requests
            </p>
            <p className='text-xs text-[--on-surface-variant] mt-0.5'>
              Latest API activity
            </p>
          </div>
          <div className='flex-1 overflow-y-auto divide-y divide-[rgba(203,213,225,0.25)] max-h-[380px]'>
            {recentRows.length === 0 ? (
              <div className='p-6 text-center text-sm text-[--on-surface-variant]'>
                No recent requests
              </div>
            ) : (
              recentRows.map((r) => (
                <div
                  key={r.id}
                  className='px-5 py-3 hover:bg-[--surface-container-low]/50 transition-colors'
                >
                  <div className='flex items-start justify-between gap-2'>
                    <div className='min-w-0'>
                      <p className='text-sm font-mono font-medium text-[--on-surface] truncate'>
                        {r.model ?? "—"}
                      </p>
                      <p className='text-xs text-[--on-surface-variant] mt-0.5'>
                        {r.provider ?? "—"}
                      </p>
                    </div>
                    <div className='text-right shrink-0'>
                      <p className='text-xs tabular-nums text-[--primary]'>
                        {r.promptTokens.toLocaleString()}↑{" "}
                        <span className='text-[--on-surface-variant]'>
                          {r.completionTokens.toLocaleString()}↓
                        </span>
                      </p>
                      <p className='text-xs text-[--on-surface-variant] mt-0.5'>
                        {relTime(r.timestamp)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Unified Usage Table with dropdown */}
      <div className={cardStyle}>
        <div className='px-6 py-4 border-b border-[rgba(203,213,225,0.4)] flex items-center justify-between gap-4'>
          <div>
            <p className='text-sm font-semibold text-[--on-surface]'>
              Usage Breakdown
            </p>
            <p className='text-xs text-[--on-surface-variant] mt-0.5'>
              Costs and requests grouped by dimension
            </p>
          </div>
          <select
            value={view}
            onChange={(e) => setView(e.target.value as ViewOption)}
            className='h-9 px-3 pr-8 text-sm font-medium rounded-lg border border-[rgba(203,213,225,0.6)] bg-[--surface-container-low] text-[--on-surface] focus:outline-none focus:border-[--primary] cursor-pointer appearance-none'
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 10px center",
            }}
          >
            {VIEW_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {tableRows.length === 0 ? (
          <div className='p-10 text-center text-sm text-[--on-surface-variant]'>
            No data for this period.
          </div>
        ) : (
          <Table stickyHeader>
            <TableHeader>
              <TableRow className='border-b border-[rgba(203,213,225,0.4)]'>
                <TableHead className='uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 pl-6'>
                  {view === "model"
                    ? "Model"
                    : view === "provider"
                      ? "Provider"
                      : "API Key"}
                </TableHead>
                <TableHead className='uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 text-right'>
                  Requests
                </TableHead>
                {view !== "apikey" && (
                  <TableHead className='uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 text-right hidden sm:table-cell'>
                    Tokens
                  </TableHead>
                )}
                <TableHead className='uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 text-right pr-6'>
                  Cost
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableRows.map((r, i) => (
                <TableRow
                  key={r.key}
                  className={
                    "border-b border-[rgba(203,213,225,0.25)] hover:bg-[--surface-container-low]/50 transition-colors" +
                    (i % 2 === 1 ? " bg-[--surface-container-low]/40" : "")
                  }
                >
                  <TableCell className='pl-6 py-3'>
                    <Badge variant='endpoint'>{r.label}</Badge>
                  </TableCell>
                  <TableCell className='text-sm text-right tabular-nums text-[--on-surface] py-3'>
                    {r.requests.toLocaleString()}
                  </TableCell>
                  {view !== "apikey" && (
                    <TableCell className='text-sm text-right tabular-nums text-[--on-surface] py-3 hidden sm:table-cell'>
                      {fmt(r.tokens)}
                    </TableCell>
                  )}
                  <TableCell className='text-sm text-right tabular-nums text-[--on-surface] py-3 pr-6'>
                    ${r.cost.toFixed(4)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

// ─── Details Tab ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

function DetailsTab({ apiKeyMap }: { apiKeyMap: Map<string, string> }) {
  const [rows, setRows] = useState<UsageRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [selectedRow, setSelectedRow] = useState<UsageRecord | null>(null);

  // Filters
  const [provider, setProvider] = useState("");
  const [apiKeyId, setApiKeyId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const load = useCallback(
    async (p: number) => {
      setLoading(true);
      try {
        const params: Record<string, string> = {
          limit: String(PAGE_SIZE),
          offset: String(p * PAGE_SIZE),
        };
        if (provider) params.provider = provider;
        if (apiKeyId) params.apiKeyId = apiKeyId;
        if (startDate) params.startDate = new Date(startDate).toISOString();
        if (endDate) params.endDate = new Date(endDate).toISOString();

        const data = (await api.usage.requestDetails(params)) as {
          rows: UsageRecord[];
          total: number;
        };
        setRows(data.rows ?? []);
        setTotal(data.total ?? 0);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [provider, apiKeyId, startDate, endDate],
  );

  useEffect(() => {
    setPage(0);
    load(0);
  }, [load]);

  function handlePage(next: number) {
    setPage(next);
    load(next);
  }

  function clearFilters() {
    setProvider("");
    setApiKeyId("");
    setStartDate("");
    setEndDate("");
    setPage(0);
  }

  const hasFilters = provider || apiKeyId || startDate || endDate;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className='space-y-4'>
      {/* Filter Bar */}
      <div className={cardStyle + " p-4"}>
        <div className='flex flex-wrap items-end gap-3'>
          <div className='flex flex-col gap-1 min-w-[140px] sm:min-w-[160px]'>
            <label className='text-xs uppercase tracking-[0.12em] font-semibold text-[--on-surface-variant]'>
              Provider
            </label>
            <input
              type='text'
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              placeholder='e.g. pro-x'
              className='h-9 px-3 text-sm rounded-lg border border-[rgba(203,213,225,0.6)] bg-[--surface-container-low] text-[--on-surface] focus:outline-none focus:border-[--primary] placeholder:text-[--on-surface-variant]/50'
            />
          </div>
          <div className='flex flex-col gap-1 min-w-[150px] sm:min-w-[180px]'>
            <label className='text-xs uppercase tracking-[0.12em] font-semibold text-[--on-surface-variant]'>
              API Key
            </label>
            <select
              value={apiKeyId}
              onChange={(e) => setApiKeyId(e.target.value)}
              className='h-9 px-3 pr-8 text-sm rounded-lg border border-[rgba(203,213,225,0.6)] bg-[--surface-container-low] text-[--on-surface] focus:outline-none focus:border-[--primary] appearance-none cursor-pointer'
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 10px center",
              }}
            >
              <option value=''>All API Keys</option>
              {Array.from(apiKeyMap.entries()).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className='flex flex-col gap-1'>
            <label className='text-xs uppercase tracking-[0.12em] font-semibold text-[--on-surface-variant]'>
              Start Date
            </label>
            <input
              type='datetime-local'
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className='h-9 px-3 text-sm rounded-lg border border-[rgba(203,213,225,0.6)] bg-[--surface-container-low] text-[--on-surface] focus:outline-none focus:border-[--primary]'
            />
          </div>
          <div className='flex flex-col gap-1'>
            <label className='text-xs uppercase tracking-[0.12em] font-semibold text-[--on-surface-variant]'>
              End Date
            </label>
            <input
              type='datetime-local'
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className='h-9 px-3 text-sm rounded-lg border border-[rgba(203,213,225,0.6)] bg-[--surface-container-low] text-[--on-surface] focus:outline-none focus:border-[--primary]'
            />
          </div>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className='h-9 px-4 text-sm font-medium text-[--on-surface-variant] hover:text-[--on-surface] flex items-center gap-1.5 rounded-lg hover:bg-[--surface-container-low] transition-colors'
            >
              <X className='w-3.5 h-3.5' />
              Clear Filters
            </button>
          )}
          <div className='ml-auto flex items-center gap-2'>
            <SlidersHorizontal className='w-4 h-4 text-[--on-surface-variant]' />
            <span className='text-sm text-[--on-surface-variant]'>
              {total.toLocaleString()} records
            </span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className={cardStyle}>
        {loading ? (
          <div className='p-12 text-center'>
            <p className='text-[--on-surface-variant] text-sm'>Loading…</p>
          </div>
        ) : rows.length === 0 ? (
          <div className='p-12 text-center'>
            <p className='text-[--on-surface-variant] text-sm'>
              No records found.
            </p>
          </div>
        ) : (
          <>
            <Table stickyHeader className='min-w-full'>
              <TableHeader>
                <TableRow className='border-b border-[rgba(203,213,225,0.4)]'>
                  <TableHead className='uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 pl-6'>
                    Timestamp
                  </TableHead>
                  <TableHead className='uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3'>
                    Model
                  </TableHead>
                  <TableHead className='uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 hidden md:table-cell'>
                    Provider
                  </TableHead>
                  <TableHead className='uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 hidden lg:table-cell'>
                    API Key
                  </TableHead>
                  <TableHead className='uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 text-right hidden sm:table-cell'>
                    Input Tokens
                  </TableHead>
                  <TableHead className='uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 text-right hidden sm:table-cell'>
                    Output Tokens
                  </TableHead>
                  <TableHead className='uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 text-right'>
                    Cost
                  </TableHead>
                  <TableHead className='uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 hidden md:table-cell'>
                    Status
                  </TableHead>
                  <TableHead className='uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 hidden lg:table-cell'>
                    Latency
                  </TableHead>
                  <TableHead className='uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 pr-6 text-right'>
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow
                    key={r.id}
                    className={
                      "border-b border-[rgba(203,213,225,0.25)] hover:bg-[--surface-container-low]/50 transition-colors cursor-pointer" +
                      (i % 2 === 1 ? " bg-[--surface-container-low]/40" : "")
                    }
                    onClick={() => setSelectedRow(r)}
                  >
                    <TableCell className='pl-6 py-3 text-sm text-[--on-surface-variant] whitespace-nowrap'>
                      {new Date(r.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell className='py-3'>
                      <Badge variant='endpoint'>{r.model ?? "—"}</Badge>
                    </TableCell>
                    <TableCell className='text-sm text-[--on-surface] py-3 hidden md:table-cell'>
                      {r.provider ?? "—"}
                    </TableCell>
                    <TableCell className='py-3 hidden lg:table-cell'>
                      {r.apiKeyId ? (
                        <Badge variant='secondary'>
                          {apiKeyMap.get(r.apiKeyId) ?? r.apiKeyId}
                        </Badge>
                      ) : (
                        <span className='text-sm text-[--on-surface-variant]'>
                          —
                        </span>
                      )}
                    </TableCell>
                    <TableCell className='text-sm text-right tabular-nums text-[--primary] py-3 hidden sm:table-cell'>
                      {r.promptTokens.toLocaleString()}
                    </TableCell>
                    <TableCell className='text-sm text-right tabular-nums text-[--on-surface] py-3 hidden sm:table-cell'>
                      {r.completionTokens.toLocaleString()}
                    </TableCell>
                    <TableCell className='text-sm text-right tabular-nums text-[--on-surface] py-3'>
                      ${r.cost.toFixed(5)}
                    </TableCell>
                    <TableCell className='py-3 hidden md:table-cell'>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className='text-sm text-[--on-surface-variant] py-3 whitespace-nowrap hidden lg:table-cell'>
                      {r.durationMs
                        ? `${r.durationMs.toLocaleString()}ms`
                        : "—"}
                    </TableCell>
                    <TableCell className='pr-6 text-right py-3'>
                      <Button
                        variant='outline'
                        size='sm'
                        className='h-7 px-3 text-xs font-medium rounded-md'
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedRow(r);
                        }}
                      >
                        <ExternalLink className='w-3 h-3 mr-1' />
                        Detail
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination */}
            <PaginationControls
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={PAGE_SIZE}
              onPageChange={handlePage}
              label='RECORDS'
            />
          </>
        )}
      </div>

      {/* Detail Dialog */}
      <Dialog
        open={!!selectedRow}
        onOpenChange={(open) => !open && setSelectedRow(null)}
      >
        <DialogContent className='max-w-2xl bg-[--surface-container-lowest] border border-[rgba(203,213,225,0.6)]'>
          <DialogHeader>
            <DialogTitle>Request Detail</DialogTitle>
            <DialogDescription className='font-mono text-xs'>
              ID: {selectedRow?.id}
            </DialogDescription>
          </DialogHeader>
          {selectedRow && (
            <div className='space-y-4'>
              {/* Key-value grid */}
              <div className='grid grid-cols-2 gap-3'>
                {(
                  [
                    [
                      "Timestamp",
                      new Date(selectedRow.timestamp).toLocaleString(),
                    ],
                    ["Model", selectedRow.model ?? "—"],
                    ["Provider", selectedRow.provider ?? "—"],
                    [
                      "API Key",
                      selectedRow.apiKeyId
                        ? (apiKeyMap.get(selectedRow.apiKeyId) ??
                          selectedRow.apiKeyId)
                        : "—",
                    ],
                    ["Status", selectedRow.status],
                    [
                      "Duration",
                      selectedRow.durationMs
                        ? `${selectedRow.durationMs}ms`
                        : "—",
                    ],
                    [
                      "Prompt Tokens",
                      selectedRow.promptTokens.toLocaleString(),
                    ],
                    [
                      "Completion Tokens",
                      selectedRow.completionTokens.toLocaleString(),
                    ],
                    [
                      "Reasoning Tokens",
                      selectedRow.reasoningTokens?.toLocaleString() ?? "0",
                    ],
                    [
                      "Cached Tokens",
                      selectedRow.cachedTokens?.toLocaleString() ?? "0",
                    ],
                    ["Cost", `$${selectedRow.cost.toFixed(6)}`],
                    ["Endpoint", selectedRow.endpoint ?? "—"],
                  ] as [string, string][]
                ).map(([label, value]) => (
                  <div
                    key={label}
                    className='bg-[--surface-container-low] rounded-lg p-3'
                  >
                    <p className='text-xs uppercase tracking-[0.12em] font-semibold text-[--on-surface-variant]'>
                      {label}
                    </p>
                    <p className='text-sm font-medium text-[--on-surface] mt-1 break-all'>
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Raw JSON */}
              <div>
                <p className='text-xs uppercase tracking-[0.12em] font-semibold text-[--on-surface-variant] mb-2'>
                  Raw JSON
                </p>
                <pre className='bg-[--surface-container-low] rounded-lg p-4 text-xs font-mono text-[--on-surface] overflow-auto max-h-56 whitespace-pre-wrap break-all'>
                  {JSON.stringify(selectedRow, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Root Component ────────────────────────────────────────────────────────────

export default function Usage() {
  const [period, setPeriod] = useState<Period>("7d");
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [recentRows, setRecentRows] = useState<UsageRecord[]>([]);
  const [apiKeyMap, setApiKeyMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const esRef = useRef<EventSource | null>(null);

  const loadStats = useCallback(async (p: Period) => {
    setLoading(true);
    try {
      const data = (await api.usage.stats(p)) as UsageStats;
      setStats(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRecent = useCallback(async () => {
    try {
      const data = (await api.usage.requestDetails({
        limit: "15",
        offset: "0",
      })) as {
        rows: UsageRecord[];
        total: number;
      };
      setRecentRows(data.rows ?? []);
    } catch {
      // silently fail
    }
  }, []);

  const loadApiKeys = useCallback(async () => {
    try {
      const data = (await api.keys.list()) as { keys: ApiKeyRecord[] };
      const map = new Map<string, string>();
      for (const k of data.keys ?? []) map.set(k.id, k.name);
      setApiKeyMap(map);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    loadStats(period);
    const id = setInterval(() => loadStats(period), 30_000);
    return () => clearInterval(id);
  }, [period, loadStats]);

  useEffect(() => {
    loadRecent();
    loadApiKeys();
  }, [loadRecent, loadApiKeys]);

  useEffect(() => {
    const es = new EventSource("/api/usage/stream");
    esRef.current = es;
    es.onmessage = (e) => {
      try {
        JSON.parse(e.data);
        loadStats(period);
        loadRecent();
      } catch {
        /* heartbeat */
      }
    };
    return () => {
      es.close();
      esRef.current = null;
    };
  }, [period, loadStats, loadRecent]);

  return (
    <div className='space-y-6'>
      {/* Page Header */}
      <div className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4'>
        <div>
          <h1 className='font-headline text-2xl sm:text-3xl font-bold tracking-tight text-[--on-surface]'>
            Usage
          </h1>
          <p className='text-xs uppercase tracking-[0.12em] text-[--on-surface-variant] mt-1 sm:mt-1.5 font-medium'>
            Monitor your API usage and token consumption
          </p>
        </div>
        {/* Period selector — only relevant on Overview */}
        {activeTab === "overview" && (
          <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <TabsList className='h-8 sm:h-9 bg-[--surface-container-low] rounded-lg p-1'>
              {PERIODS.map((p) => (
                <TabsTrigger
                  key={p}
                  value={p}
                  className='h-6 sm:h-7 px-2 sm:px-3 rounded text-xs sm:text-sm font-medium data-[state=active]:bg-[--surface-container-lowest] data-[state=active]:shadow-sm'
                >
                  {p}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
      </div>

      {/* Overview / Details tab switcher */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className='h-9 bg-[--surface-container-low] rounded-lg p-1'>
          <TabsTrigger
            value='overview'
            className='h-7 px-4 rounded text-sm font-medium data-[state=active]:bg-[--surface-container-lowest] data-[state=active]:shadow-sm'
          >
            Overview
          </TabsTrigger>
          <TabsTrigger
            value='details'
            className='h-7 px-4 rounded text-sm font-medium data-[state=active]:bg-[--surface-container-lowest] data-[state=active]:shadow-sm'
          >
            Details
          </TabsTrigger>
        </TabsList>

        <TabsContent value='overview' className='mt-6'>
          {loading && !stats ? (
            <div className='p-12 text-center'>
              <p className='text-[--on-surface-variant] text-sm'>Loading…</p>
            </div>
          ) : stats ? (
            <OverviewTab
              period={period}
              stats={stats}
              recentRows={recentRows}
              apiKeyMap={apiKeyMap}
            />
          ) : null}
        </TabsContent>

        <TabsContent value='details' className='mt-6'>
          <DetailsTab apiKeyMap={apiKeyMap} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
