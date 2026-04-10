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
import type { ZaiUsageResponse } from "@/lib/zaiTypes.ts";
import { SectionHeader } from "@/components/SectionHeader.tsx";
import { QuotaCard } from "@/components/QuotaCard.tsx";
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

export function UsageTab({ usage }: { usage: ZaiUsageResponse }) {
  const data = usage.success ? usage.data : null;

  if (!data) {
    return (
      <div className={`${cardClass} px-12 py-12 text-center text-[13px] text-[var(--on-surface-variant)]`}>
        No usage data available.
      </div>
    );
  }

  const { totalUsage, modelSummaryList, modelDataList, tokensUsage, x_time, modelCallCount } = data;

  // Summary cards
  const summaryCards = (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 mb-4">
      <QuotaCard
        label="Total Tokens"
        value={fmt(totalUsage.totalTokensUsage)}
        sub="All models combined"
      />
      <QuotaCard
        label="Total Calls"
        value={fmt(totalUsage.totalModelCallCount)}
        sub="API requests"
      />
      <QuotaCard
        label="Granularity"
        value={data.granularity === "hourly" ? "Hourly" : data.granularity}
        sub="Data resolution"
      />
      <QuotaCard
        label="Data Points"
        value={String(x_time.length)}
        sub="Time intervals"
      />
    </div>
  );

  // Per-model breakdown table
  const sortedModels = [...modelSummaryList].sort((a, b) => b.totalTokens - a.totalTokens);
  const modelBreakdown = (
    <div className={cardClass}>
      <SectionHeader
        title="Token Usage by Model"
        sub="Total tokens consumed per model"
      />
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[rgba(203,213,225,0.4)]">
              <th className="px-6 py-3 text-[11px] uppercase tracking-[0.12em] text-[var(--on-surface-variant)] font-600">
                Model
              </th>
              <th className="px-6 py-3 text-[11px] uppercase tracking-[0.12em] text-[var(--on-surface-variant)] font-600 text-right">
                Tokens
              </th>
              <th className="px-6 py-3 text-[11px] uppercase tracking-[0.12em] text-[var(--on-surface-variant)] font-600 text-right">
                % of Total
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedModels.map((model) => {
              const pct = ((model.totalTokens / totalUsage.totalTokensUsage) * 100).toFixed(1);
              return (
                <tr key={model.modelName} className="border-b border-[rgba(203,213,225,0.2)] hover:bg-[rgba(203,213,225,0.1)]">
                  <td className="px-6 py-3 text-[13px] text-[var(--on-surface)] font-500">
                    {model.modelName}
                  </td>
                  <td className="px-6 py-3 text-[13px] text-[var(--on-surface)] text-right">
                    {fmt(model.totalTokens)}
                  </td>
                  <td className="px-6 py-3 text-[13px] text-[var(--on-surface)] text-right">
                    {pct}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  // Time-series chart
  const timeSeriesChart = (
    <div className={cardClass}>
      <SectionHeader
        title="Token Usage Over Time"
        sub="Hourly token usage and API call volume"
      />
      <div className="h-[300px] p-5 px-6">
        <Chart
          type="bar"
          data={{
            labels: x_time.map((t) => {
              // Format: "2026-04-04 00:00" -> "04-04 00:00"
              const parts = t.split(" ");
              if (parts.length >= 2) {
                const date = parts[0].slice(5); // Remove "2026-"
                return `${date} ${parts[1]?.slice(0, 5)}`;
              }
              return t;
            }),
            datasets: [
              {
                type: "bar" as const,
                label: "Tokens",
                data: tokensUsage,
                backgroundColor: "rgba(59, 130, 246, 0.75)",
                borderRadius: 4,
                yAxisID: "y",
                order: 2,
              },
              {
                type: "line" as const,
                label: "Calls",
                data: modelCallCount,
                borderColor: "rgba(34, 197, 94, 0.9)",
                backgroundColor: "rgba(34, 197, 94, 0.08)",
                fill: true,
                tension: 0.4,
                yAxisID: "y1",
                pointRadius: 2,
                pointBackgroundColor: "rgba(34, 197, 94, 0.9)",
                borderWidth: 2,
                order: 1,
              },
            ],
          }}
          options={{
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
                      ? ` Tokens: ${fmt(v)}`
                      : ` Calls: ${v.toLocaleString()}`;
                  },
                },
              },
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: {
                  font: { size: 10 },
                  color: "#64748b",
                  maxRotation: 45,
                  minRotation: 45,
                  maxTicksLimit: 12,
                },
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
          }}
        />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {summaryCards}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
        {modelBreakdown}
        {timeSeriesChart}
      </div>
    </div>
  );
}
