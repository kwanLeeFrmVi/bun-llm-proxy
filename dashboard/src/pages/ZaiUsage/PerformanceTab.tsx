import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  LineController,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";
import type { ZaiPerformanceResponse } from "@/lib/zaiTypes.ts";
import { SectionHeader } from "@/components/SectionHeader.tsx";
import { Badge } from "@/components/ui/badge.tsx";

ChartJS.register(
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  LineController,
  Filler,
  Tooltip,
  Legend
);

const cardClass =
  "overflow-hidden rounded-xl bg-[var(--surface-container-lowest)] border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)]";

export function PerformanceTab({ performance }: { performance: ZaiPerformanceResponse }) {
  const data = performance.success ? performance.data : null;

  if (!data || !data.x_time?.length) {
    return (
      <div
        className={`${cardClass} px-12 py-12 text-center text-[13px] text-[var(--on-surface-variant)]`}
      >
        No performance data available.
      </div>
    );
  }

  // Format labels to show just the date portion
  const labels = data.x_time.map((d) => d.slice(5)); // Remove "2026-"

  // Decode Speed Chart
  const speedChartData = {
    labels,
    datasets: [
      {
        label: "Pro Max Decode Speed",
        data: data.proMaxDecodeSpeed,
        borderColor: "rgba(59, 130, 246, 0.9)",
        backgroundColor: "rgba(59, 130, 246, 0.1)",
        fill: true,
        tension: 0.3,
        pointRadius: 2,
        borderWidth: 2,
      },
      {
        label: "Lite Decode Speed",
        data: data.liteDecodeSpeed,
        borderColor: "rgba(34, 197, 94, 0.9)",
        backgroundColor: "rgba(34, 197, 94, 0.1)",
        fill: true,
        tension: 0.3,
        pointRadius: 2,
        borderWidth: 2,
      },
    ],
  };

  // Success Rate Chart
  const successChartData = {
    labels,
    datasets: [
      {
        label: "Pro Max Success Rate",
        data: data.proMaxSuccessRate.map((v) => v * 100), // Convert to percentage
        borderColor: "rgba(168, 85, 247, 0.9)",
        backgroundColor: "rgba(168, 85, 247, 0.1)",
        fill: true,
        tension: 0.3,
        pointRadius: 2,
        borderWidth: 2,
      },
      {
        label: "Lite Success Rate",
        data: data.liteSuccessRate.map((v) => v * 100), // Convert to percentage
        borderColor: "rgba(249, 115, 22, 0.9)",
        backgroundColor: "rgba(249, 115, 22, 0.1)",
        fill: true,
        tension: 0.3,
        pointRadius: 2,
        borderWidth: 2,
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
            const label = ctx.dataset.label ?? "";
            if (label.includes("Success Rate")) {
              return ` ${label}: ${v.toFixed(2)}%`;
            }
            return ` ${label}: ${v.toFixed(2)} tokens/s`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 11 }, color: "#64748b", maxRotation: 45, minRotation: 45 },
      },
      y: {
        position: "left" as const,
        grid: { color: "rgba(203,213,225,0.2)" },
        ticks: { font: { size: 11 }, color: "#64748b" },
      },
    },
  };

  // Calculate averages
  const avgProMaxSpeed =
    data.proMaxDecodeSpeed.reduce((a, b) => a + b, 0) / data.proMaxDecodeSpeed.length;
  const avgLiteSpeed =
    data.liteDecodeSpeed.reduce((a, b) => a + b, 0) / data.liteDecodeSpeed.length;
  const avgProMaxSuccess =
    (data.proMaxSuccessRate.reduce((a, b) => a + b, 0) / data.proMaxSuccessRate.length) * 100;
  const avgLiteSuccess =
    (data.liteSuccessRate.reduce((a, b) => a + b, 0) / data.liteSuccessRate.length) * 100;

  return (
    <div className="flex flex-col gap-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
        <div className={cardClass}>
          <div className="px-5 py-4">
            <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--on-surface-variant)] font-600">
              Pro Max Speed
            </p>
            <p className="mt-1 font-headline text-[24px] font-700 text-[var(--on-surface)]">
              {avgProMaxSpeed.toFixed(1)}
            </p>
            <p className="mt-1 text-[11px] text-[var(--on-surface-variant)]">tokens/s avg</p>
          </div>
        </div>
        <div className={cardClass}>
          <div className="px-5 py-4">
            <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--on-surface-variant)] font-600">
              Lite Speed
            </p>
            <p className="mt-1 font-headline text-[24px] font-700 text-[var(--on-surface)]">
              {avgLiteSpeed.toFixed(1)}
            </p>
            <p className="mt-1 text-[11px] text-[var(--on-surface-variant)]">tokens/s avg</p>
          </div>
        </div>
        <div className={cardClass}>
          <div className="px-5 py-4">
            <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--on-surface-variant)] font-600">
              Pro Max Success
            </p>
            <p className="mt-1 font-headline text-[24px] font-700 text-[var(--on-surface)]">
              {avgProMaxSuccess.toFixed(2)}%
            </p>
            <p className="mt-1 text-[11px] text-[var(--on-surface-variant)]">average rate</p>
          </div>
        </div>
        <div className={cardClass}>
          <div className="px-5 py-4">
            <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--on-surface-variant)] font-600">
              Lite Success
            </p>
            <p className="mt-1 font-headline text-[24px] font-700 text-[var(--on-surface)]">
              {avgLiteSuccess.toFixed(2)}%
            </p>
            <p className="mt-1 text-[11px] text-[var(--on-surface-variant)]">average rate</p>
          </div>
        </div>
      </div>

      {/* Decode Speed Chart */}
      <div className={cardClass}>
        <SectionHeader
          title="Decode Speed"
          sub="Token generation speed over time (tokens/second)"
        />
        <div className="h-[260px] p-5 px-6">
          <Line data={speedChartData} options={chartOptions} />
        </div>
      </div>

      {/* Success Rate Chart */}
      <div className={cardClass}>
        <SectionHeader title="Success Rate" sub="API call success rate over time (%)" />
        <div className="h-[260px] p-5 px-6">
          <Line data={successChartData} options={chartOptions} />
        </div>
      </div>
    </div>
  );
}
