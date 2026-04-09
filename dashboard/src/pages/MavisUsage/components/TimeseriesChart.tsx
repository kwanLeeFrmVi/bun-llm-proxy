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
import type { MavisUsageResponse } from "@/lib/mavisTypes.ts";
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
  Legend,
);

const cardClass = "overflow-hidden rounded-xl bg-[var(--surface-container-lowest)] border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)]";

export function TimeseriesChart({
  usage,
}: {
  usage: MavisUsageResponse | null;
}) {
  const ts = usage?.timeseries ?? [];

  if (ts.length === 0) {
    return (
      <div className={cardClass}>
        <SectionHeader
          title='Token Usage Over Time'
          sub='Daily tokens and request volume'
        />
        <div className="px-10 py-10 text-center text-[13px] text-[var(--on-surface-variant)]">
          No timeseries data available.
        </div>
      </div>
    );
  }

  const labels = ts.map((d) => d.time.slice(5));

  const chartData = {
    labels,
    datasets: [
      {
        type: "bar" as const,
        label: "Tokens",
        data: ts.map((d) => d.tokens),
        backgroundColor: "rgba(0, 83, 219, 0.75)",
        borderRadius: 4,
        yAxisID: "y",
        order: 2,
      },
      {
        type: "line" as const,
        label: "Requests",
        data: ts.map((d) => d.requests),
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
          label: (ctx: {
            dataset: { label?: string };
            parsed: { y: number | null };
          }) => {
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
      <SectionHeader
        title='Token Usage Over Time'
        sub='Daily tokens and request volume'
      />
      <div className="h-[260px] p-5 px-6">
        <Chart type='bar' data={chartData} options={chartOptions} />
      </div>
    </div>
  );
}
