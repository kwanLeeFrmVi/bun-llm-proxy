import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  BarController,
  LineController,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import { Chart } from "react-chartjs-2";
import type { TrollLogs } from "@/lib/trollTypes.ts";
import { SectionHeader } from "@/components/SectionHeader.tsx";
import { fmt } from "@/lib/formatters.ts";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  BarController,
  LineController,
  Filler,
  Tooltip,
  Legend
);

const cardClass =
  "overflow-hidden rounded-xl bg-[var(--surface-container-lowest)] border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)]";

interface AggregatedPoint {
  date: string;
  tokens: number;
  requests: number;
}

function aggregateLogs(logs: TrollLogs): AggregatedPoint[] {
  const map = new Map<string, AggregatedPoint>();

  for (const r of logs.requests) {
    const date = r.createdAt.slice(0, 10); // "2026-04-15"
    if (!map.has(date)) {
      map.set(date, { date, tokens: 0, requests: 0 });
    }
    const point = map.get(date)!;
    point.tokens += r.inputTokens + r.outputTokens;
    point.requests += 1;
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function TrollTimeseriesChart({ logs }: { logs: TrollLogs | null }) {
  const points = logs ? aggregateLogs(logs) : [];

  if (points.length === 0) {
    return (
      <div className={cardClass}>
        <SectionHeader title="Token Usage Over Time" sub="Daily tokens and request volume" />
        <div className="px-10 py-10 text-center text-[13px] text-[var(--on-surface-variant)]">
          No timeseries data available.
        </div>
      </div>
    );
  }

  const labels = points.map((d) => d.date.slice(5)); // "04-15"

  const chartData = {
    labels,
    datasets: [
      {
        type: "bar" as const,
        label: "Tokens",
        data: points.map((d) => d.tokens),
        backgroundColor: "rgba(0, 83, 219, 0.75)",
        borderRadius: 4,
        yAxisID: "y",
        order: 2,
      },
      {
        type: "line" as const,
        label: "Requests",
        data: points.map((d) => d.requests),
        borderColor: "rgba(34, 197, 94, 0.9)",
        backgroundColor: "rgba(34, 197, 94, 0.08)",
        fill: true,
        tension: 0.4,
        yAxisID: "y1",
        pointRadius: 3,
        pointBackgroundColor: "rgba(34, 197, 94, 0.9)",
        borderWidth: 2,
        order: 1,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index" as const, intersect: false },
    plugins: {
      legend: {
        position: "bottom" as const,
        labels: {
          font: { size: 11 },
          color: "#64748b",
          boxWidth: 10,
          padding: 16,
        },
      },
      tooltip: {
        callbacks: {
          label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) => {
            const v = ctx.parsed.y ?? 0;
            return ctx.dataset.label === "Tokens"
              ? ` Tokens: ${v.toLocaleString()}`
              : ` Requests: ${v.toLocaleString()}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 11 }, color: "#64748b" },
      },
      y: {
        position: "left" as const,
        grid: { color: "rgba(203,213,225,0.2)" },
        ticks: {
          font: { size: 11 },
          color: "#64748b",
          callback: (v: number | string) => fmt(Number(v)),
        },
      },
      y1: {
        position: "right" as const,
        grid: { display: false },
        ticks: { font: { size: 11 }, color: "#22c55e" },
      },
    },
  };

  return (
    <div className={cardClass}>
      <SectionHeader title="Token Usage Over Time" sub="Daily tokens and request volume" />
      <div className="h-[260px] p-5 px-6">
        <Chart type="bar" data={chartData} options={chartOptions} />
      </div>
    </div>
  );
}
