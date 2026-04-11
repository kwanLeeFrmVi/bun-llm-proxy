import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  Tooltip,
  Legend,
} from "chart.js";
import { fmt } from "./utils";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  Tooltip,
  Legend,
);

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

const cardStyle =
  "bg-[--surface-container-lowest] rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)] overflow-hidden";

export type BreakdownRow = {
  key: string;
  label: string;
  requests: number;
  tokens: number;
  cost: number;
};

type ViewOption = "model" | "provider" | "apikey";

export function BreakdownChart({
  rows,
  view,
}: {
  rows: BreakdownRow[];
  view: ViewOption;
}) {
  const top = rows.slice(0, 10).reverse();
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
