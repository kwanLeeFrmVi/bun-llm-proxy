import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api.ts";
import type { UsageStats } from "@/lib/types.ts";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NetworkGraph } from "@/components/NetworkGraph";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const PERIODS = ["24h", "7d", "30d", "all"] as const;
type Period = (typeof PERIODS)[number];

const cardStyle = "bg-[--surface-container-lowest] rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)] overflow-hidden";

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

export default function Usage() {
  const [period, setPeriod] = useState<Period>("24h");
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const esRef = useRef<EventSource | null>(null);

  const load = useCallback(async (p: Period) => {
    setLoading(true);
    try {
      const data = (await api.usage.stats(p)) as UsageStats;
      setStats(data);
    } catch {
      // silently fail, keep previous data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(period);
    const id = setInterval(() => load(period), 30_000);
    return () => clearInterval(id);
  }, [period, load]);

  useEffect(() => {
    const es = new EventSource("/api/usage/stream");
    esRef.current = es;
    es.onmessage = (e) => {
      try {
        JSON.parse(e.data);
        load(period);
      } catch {
        /* heartbeat */
      }
    };
    return () => {
      es.close();
      esRef.current = null;
    };
  }, [period, load]);

  const s = stats;

  return (
    <div className="space-y-6">
      {/* Header + Period Tabs */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-headline text-3xl font-bold tracking-tight text-[--on-surface]">
            Usage
          </h1>
          <p className="text-[11px] uppercase tracking-[0.12em] text-[--on-surface-variant] mt-1.5 font-medium">
            Monitor your API usage and token consumption
          </p>
        </div>
        <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <TabsList className="h-9 bg-[--surface-container-low] rounded-lg p-1">
            {PERIODS.map((p) => (
              <TabsTrigger
                key={p}
                value={p}
                className="h-7 px-3 rounded text-[13px] font-medium data-[state=active]:bg-[--surface-container-lowest] data-[state=active]:shadow-sm"
              >
                {p}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {loading && !s && (
        <div className="p-12 text-center">
          <p className="text-[--on-surface-variant] text-sm">Loading…</p>
        </div>
      )}

      {s && (
        <>
          {/* Summary Stat Cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className={cardStyle + " p-6"}>
              <p className="text-[11px] uppercase tracking-[0.12em] text-[--on-surface-variant] font-semibold">
                Requests
              </p>
              <p className="text-3xl font-bold font-headline mt-1 tracking-tight text-[--on-surface]">
                {fmt(s.totalRequests)}
              </p>
              <p className="text-xs text-[--primary] mt-1">+12% vs last period</p>
            </div>
            <div className={cardStyle + " p-6"}>
              <p className="text-[11px] uppercase tracking-[0.12em] text-[--on-surface-variant] font-semibold">
                Prompt Tokens
              </p>
              <p className="text-3xl font-bold font-headline mt-1 tracking-tight text-[--on-surface]">
                {fmt(s.totalPromptTokens)}
              </p>
              <p className="text-xs text-[--on-surface-variant] mt-1">Input context</p>
            </div>
            <div className={cardStyle + " p-6"}>
              <p className="text-[11px] uppercase tracking-[0.12em] text-[--on-surface-variant] font-semibold">
                Completion Tokens
              </p>
              <p className="text-3xl font-bold font-headline mt-1 tracking-tight text-[--on-surface]">
                {fmt(s.totalCompletionTokens)}
              </p>
              <p className="text-xs text-[--on-surface-variant] mt-1">Generated output</p>
            </div>
            <div className={cardStyle + " p-6"}>
              <p className="text-[11px] uppercase tracking-[0.12em] text-[--on-surface-variant] font-semibold">
                Total Cost
              </p>
              <p className="text-3xl font-bold font-headline mt-1 tracking-tight text-[--on-surface]">
                ${s.totalCost.toFixed(4)}
              </p>
              <p className="text-xs text-[--on-surface-variant] mt-1">Billed usage</p>
            </div>
          </div>

          {/* Network Graph */}
          <div className={cardStyle}>
            <div className="px-6 py-4 border-b border-[rgba(203,213,225,0.4)]">
              <p className="text-sm font-semibold text-[--on-surface]">Token Traffic Orchestration</p>
              <p className="text-[11px] text-[--on-surface-variant] mt-0.5">
                Aggregate usage across all active gateways
              </p>
            </div>
            <div className="border-t">
              <NetworkGraph />
            </div>
          </div>

          {/* Cost by Provider Chart */}
          {s.byProvider.length > 0 && (
            <div className={cardStyle}>
              <div className="px-6 py-4 border-b border-[rgba(203,213,225,0.4)]">
                <p className="text-sm font-semibold text-[--on-surface]">Cost by Provider</p>
                <p className="text-[11px] text-[--on-surface-variant] mt-0.5">
                  Breakdown of spend per provider
                </p>
              </div>
              <div className="p-6">
                <Bar
                  data={{
                    labels: s.byProvider.map((r) => r.provider),
                    datasets: [
                      {
                        label: "Cost ($)",
                        data: s.byProvider.map((r) => r.cost),
                        backgroundColor: "#0053db",
                        borderRadius: 6,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    plugins: { legend: { display: false } },
                    scales: {
                      y: { beginAtZero: true },
                      x: {
                        grid: { display: false },
                      },
                    },
                  }}
                />
              </div>
            </div>
          )}

          {/* By-Model Table */}
          {s.byModel.length > 0 && (
            <div className={cardStyle}>
              <div className="px-6 py-4 border-b border-[rgba(203,213,225,0.4)]">
                <p className="text-sm font-semibold text-[--on-surface]">By Model</p>
                <p className="text-[11px] text-[--on-surface-variant] mt-0.5">
                  Usage statistics per model
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-[rgba(203,213,225,0.4)]">
                    <TableHead className="uppercase text-[11px] tracking-[0.1em] font-semibold text-[--on-surface-variant] py-3 pl-6">
                      Model
                    </TableHead>
                    <TableHead className="uppercase text-[11px] tracking-[0.1em] font-semibold text-[--on-surface-variant] py-3 text-right">
                      Requests
                    </TableHead>
                    <TableHead className="uppercase text-[11px] tracking-[0.1em] font-semibold text-[--on-surface-variant] py-3 text-right">
                      Tokens
                    </TableHead>
                    <TableHead className="uppercase text-[11px] tracking-[0.1em] font-semibold text-[--on-surface-variant] py-3 text-right">
                      Cost
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.byModel.map((r, i) => (
                    <TableRow
                      key={r.model}
                      className={
                        "border-b border-[rgba(203,213,225,0.25)] hover:bg-[--surface-container-low]/50 transition-colors" +
                        (i % 2 === 1 ? " bg-[--surface-container-low]/40" : "")
                      }
                    >
                      <TableCell className="pl-6 py-3">
                        <Badge variant="endpoint">{r.model}</Badge>
                      </TableCell>
                      <TableCell className="text-[13px] text-right tabular-nums text-[--on-surface] py-3">
                        {r.requests.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-[13px] text-right tabular-nums text-[--on-surface] py-3">
                        {fmt(r.tokens)}
                      </TableCell>
                      <TableCell className="text-[13px] text-right tabular-nums text-[--on-surface] py-3">
                        ${r.cost.toFixed(4)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
