import { useState } from "react";
import type { UsageStats, UsageRecord } from "@/lib/types.ts";
import type { ProviderNode } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProviderTopology } from "@/components/ProviderTopology";
import { BreakdownChart } from "./BreakdownChart";
import { cardStyle, fmt } from "./utils";

type Period = "24h" | "7d" | "30d" | "all";

type ViewOption = "model" | "provider" | "apikey";

const VIEW_OPTIONS = [
  { value: "model", label: "Usage by Model" },
  { value: "provider", label: "Usage by Provider" },
  { value: "apikey", label: "Usage by API Key" },
] as const;

export function OverviewTab({
  period,
  stats,
  recentRows,
  apiKeyMap,
  nodes,
}: {
  period: Period;
  stats: UsageStats;
  recentRows: UsageRecord[];
  apiKeyMap: Map<string, string>;
  nodes: ProviderNode[];
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
    <div className="space-y-6">
      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={cardStyle + " p-6"}>
          <p className="text-xs uppercase tracking-[0.12em] text-[--on-surface-variant] font-semibold">
            Total Requests
          </p>
          <p className="text-3xl font-bold font-headline mt-1 tracking-tight text-[--on-surface]">
            {fmt(s.totalRequests)}
          </p>
          <p className="text-xs text-[--on-surface-variant] mt-1">{period} window</p>
        </div>
        <div className={cardStyle + " p-6"}>
          <p className="text-xs uppercase tracking-[0.12em] text-[--on-surface-variant] font-semibold">
            Input Tokens
          </p>
          <p className="text-3xl font-bold font-headline mt-1 tracking-tight text-[--primary]">
            {fmt(s.totalPromptTokens)}
          </p>
          <p className="text-xs text-[--on-surface-variant] mt-1">Prompt / context</p>
        </div>
        <div className={cardStyle + " p-6"}>
          <p className="text-xs uppercase tracking-[0.12em] text-[--on-surface-variant] font-semibold">
            Output Tokens
          </p>
          <p className="text-3xl font-bold font-headline mt-1 tracking-tight text-[--on-surface]">
            {fmt(s.totalCompletionTokens)}
          </p>
          <p className="text-xs text-[--on-surface-variant] mt-1">Generated output</p>
        </div>
        <div className={cardStyle + " p-6"}>
          <p className="text-xs uppercase tracking-[0.12em] text-[--on-surface-variant] font-semibold">
            Est. Cost
          </p>
          <p className="text-3xl font-bold font-headline mt-1 tracking-tight text-[--on-surface]">
            ~${s.totalCost.toFixed(2)}
          </p>
          <p className="text-xs text-[--on-surface-variant] mt-1">Estimated, not actual billing</p>
        </div>
      </div>

      {/* Breakdown Chart */}
      <BreakdownChart rows={tableRows} view={view} />

      {/* Network Graph + Recent Requests */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Network Graph */}
        <div className={cardStyle + " lg:col-span-3"}>
          <div className="px-6 py-4 border-b border-[rgba(203,213,225,0.4)]">
            <p className="text-sm font-semibold text-[--on-surface]">Token Traffic Orchestration</p>
            <p className="text-xs text-[--on-surface-variant] mt-0.5">
              Aggregate usage across all active gateways
            </p>
          </div>
          <ProviderTopology
            providers={stats.byProvider}
            lastProvider={recentRows[0]?.provider}
            nodes={nodes}
          />
        </div>

        {/* Recent Requests */}
        <div className={cardStyle + " lg:col-span-2 flex flex-col"}>
          <div className="px-5 py-4 border-b border-[rgba(203,213,225,0.4)]">
            <p className="text-sm font-semibold text-[--on-surface]">Recent Requests</p>
            <p className="text-xs text-[--on-surface-variant] mt-0.5">Latest API activity</p>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-[rgba(203,213,225,0.25)] max-h-[380px]">
            {recentRows.length === 0 ? (
              <div className="p-6 text-center text-sm text-[--on-surface-variant]">
                No recent requests
              </div>
            ) : (
              recentRows.map((r) => (
                <div
                  key={r.id}
                  className="px-5 py-3 hover:bg-[--surface-container-low]/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-mono font-medium text-[--on-surface] truncate">
                        {r.model ?? "—"}
                      </p>
                      <p className="text-xs text-[--on-surface-variant] mt-0.5">
                        {r.provider ?? "—"}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs tabular-nums text-[--primary]">
                        {r.promptTokens.toLocaleString()}↑{" "}
                        <span className="text-[--on-surface-variant]">
                          {r.completionTokens.toLocaleString()}↓
                        </span>
                      </p>
                      <p className="text-xs text-[--on-surface-variant] mt-0.5">
                        {new Date(r.timestamp).toLocaleString()}
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
        <div className="px-6 py-4 border-b border-[rgba(203,213,225,0.4)] flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[--on-surface]">Usage Breakdown</p>
            <p className="text-xs text-[--on-surface-variant] mt-0.5">
              Costs and requests grouped by dimension
            </p>
          </div>
          <select
            value={view}
            onChange={(e) => setView(e.target.value as ViewOption)}
            className="h-9 px-3 pr-8 text-sm font-medium rounded-lg border border-[rgba(203,213,225,0.6)] bg-[--surface-container-low] text-[--on-surface] focus:outline-none focus:border-[--primary] cursor-pointer appearance-none"
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
          <div className="p-10 text-center text-sm text-[--on-surface-variant]">
            No data for this period.
          </div>
        ) : (
          <Table stickyHeader>
            <TableHeader>
              <TableRow className="border-b border-[rgba(203,213,225,0.4)]">
                <TableHead className="uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 pl-6">
                  {view === "model" ? "Model" : view === "provider" ? "Provider" : "API Key"}
                </TableHead>
                <TableHead className="uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 text-right">
                  Requests
                </TableHead>
                {view !== "apikey" && (
                  <TableHead className="uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 text-right hidden sm:table-cell">
                    Tokens
                  </TableHead>
                )}
                <TableHead className="uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 text-right pr-6">
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
                  <TableCell className="pl-6 py-3">
                    <Badge variant="endpoint">{r.label}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-right tabular-nums text-[--on-surface] py-3">
                    {r.requests.toLocaleString()}
                  </TableCell>
                  {view !== "apikey" && (
                    <TableCell className="text-sm text-right tabular-nums text-[--on-surface] py-3 hidden sm:table-cell">
                      {fmt(r.tokens)}
                    </TableCell>
                  )}
                  <TableCell className="text-sm text-right tabular-nums text-[--on-surface] py-3 pr-6">
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
