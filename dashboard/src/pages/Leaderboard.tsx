import { useState, useEffect } from "react";
import { api } from "@/lib/api.ts";
import { Trophy, TrendingUp, MessageSquare, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface LeaderboardEntry {
  userId: string;
  username: string;
  role: string;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  totalCost: number;
  requestCount: number;
}

type Period = "2h" | "5h" | "24h" | "7d" | "30d";

const PERIODS: { value: Period; label: string }[] = [
  { value: "2h", label: "2h" },
  { value: "5h", label: "5h" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
];

const cardStyle =
  "bg-[--surface-container-lowest] rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)] overflow-hidden";

function RoleBadge({ role }: { role: string }) {
  return role === "admin" ? (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
      Admin
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
      User
    </span>
  );
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
  return num.toLocaleString();
}

function formatCost(cost: number): string {
  if (cost === 0) return "$0.00";
  if (cost < 0.01) return "<$0.01";
  return `$${cost.toFixed(2)}`;
}

function RankBadge({ rank }: { rank: number }) {
  const colors = [
    "bg-gradient-to-br from-yellow-400 to-amber-500 text-white",
    "bg-gradient-to-br from-slate-300 to-slate-400 text-white",
    "bg-gradient-to-br from-amber-600 to-amber-700 text-white",
  ];

  if (rank <= 3) {
    return (
      <div
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow-sm",
          colors[rank - 1]
        )}
      >
        {rank}
      </div>
    );
  }

  return (
    <div className="w-8 h-8 rounded-full bg-[--surface-container-high] flex items-center justify-center font-semibold text-sm text-[--on-surface-variant]">
      {rank}
    </div>
  );
}

export default function Leaderboard() {
  const [period, setPeriod] = useState<Period>("24h");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const data = await api.usage.leaderboard(period);
      setLeaderboard(data.leaderboard);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load leaderboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [period]);

  // Calculate totals
  const totalTokens = leaderboard.reduce((sum, e) => sum + e.totalTokens, 0);
  const totalCost = leaderboard.reduce((sum, e) => sum + e.totalCost, 0);
  const totalRequests = leaderboard.reduce((sum, e) => sum + e.requestCount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-headline text-2xl sm:text-3xl font-bold tracking-tight text-[--on-surface] flex items-center gap-3">
          <Trophy className="w-8 h-8 text-amber-500" />
          Leaderboard
        </h1>
        <p className="text-xs uppercase tracking-[0.12em] text-[--on-surface-variant] mt-1 font-medium">
          User token usage rankings
        </p>
      </div>

      {/* Period Selector */}
      <div className="flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-semibold transition-all",
              period === p.value
                ? "bg-[--primary] text-[--on-primary] shadow-md"
                : "bg-[--surface-container-low] text-[--on-surface-variant] hover:bg-[--surface-container-high]"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className={cardStyle + " p-6"}>
          <p className="text-xs uppercase tracking-[0.12em] text-[--on-surface-variant] font-semibold">
            Total Tokens
          </p>
          <p className="text-3xl font-bold font-headline mt-1 tracking-tight text-[--on-surface]">
            {formatNumber(totalTokens)}
          </p>
        </div>
        <div className={cardStyle + " p-6"}>
          <p className="text-xs uppercase tracking-[0.12em] text-[--on-surface-variant] font-semibold">
            Total Cost
          </p>
          <p className="text-3xl font-bold font-headline mt-1 tracking-tight text-[--on-surface]">
            {formatCost(totalCost)}
          </p>
        </div>
        <div className={cardStyle + " p-6"}>
          <p className="text-xs uppercase tracking-[0.12em] text-[--on-surface-variant] font-semibold">
            Total Requests
          </p>
          <p className="text-3xl font-bold font-headline mt-1 tracking-tight text-[--on-surface]">
            {formatNumber(totalRequests)}
          </p>
        </div>
      </div>

      {/* Leaderboard Table */}
      <div className={cardStyle}>
        <div className="px-6 py-4 border-b border-[rgba(203,213,225,0.4)]">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-semibold text-[--on-surface]">
              Rankings — {PERIODS.find((p) => p.value === period)?.label}
            </span>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <p className="text-[--on-surface-variant] text-sm">Loading…</p>
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="p-12 text-center">
            <Trophy className="w-12 h-12 text-[--on-surface-variant] mx-auto mb-3 opacity-50" />
            <p className="text-[--on-surface-variant] text-sm">No usage data for this period</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[rgba(203,213,225,0.4)]">
                  <th className="uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 pl-6 text-left">
                    Rank
                  </th>
                  <th className="uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 text-left">
                    User
                  </th>
                  <th className="uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 text-right">
                    <TrendingUp className="w-3.5 h-3.5 inline mr-1" />
                    Total Tokens
                  </th>
                  <th className="uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 text-right hidden sm:table-cell">
                    Prompt / Completion
                  </th>
                  <th className="uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 text-right hidden md:table-cell">
                    <DollarSign className="w-3.5 h-3.5 inline mr-1" />
                    Cost
                  </th>
                  <th className="uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 text-right pr-6">
                    <MessageSquare className="w-3.5 h-3.5 inline mr-1" />
                    Requests
                  </th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((entry, i) => (
                  <tr
                    key={entry.userId}
                    className={cn(
                      "border-b border-[rgba(203,213,225,0.25)] hover:bg-[--surface-container-low]/50 transition-colors",
                      i % 2 === 1 && "bg-[--surface-container-low]/40"
                    )}
                  >
                    <td className="pl-6 py-4">
                      <RankBadge rank={i + 1} />
                    </td>
                    <td className="py-4">
                      <div className="flex items-center gap-2.5">
                        <span className="text-sm font-semibold text-[--on-surface]">
                          {entry.username}
                        </span>
                        <RoleBadge role={entry.role} />
                      </div>
                    </td>
                    <td className="text-right py-4">
                      <span className="text-sm font-bold text-[--on-surface]">
                        {formatNumber(entry.totalTokens)}
                      </span>
                    </td>
                    <td className="text-right py-4 hidden sm:table-cell">
                      <span className="text-xs text-[--on-surface-variant]">
                        {formatNumber(entry.promptTokens)} / {formatNumber(entry.completionTokens)}
                      </span>
                    </td>
                    <td className="text-right py-4 hidden md:table-cell">
                      <span className="text-sm text-[--on-surface-variant]">
                        {formatCost(entry.totalCost)}
                      </span>
                    </td>
                    <td className="pr-6 text-right py-4">
                      <span className="text-sm text-[--on-surface-variant]">
                        {formatNumber(entry.requestCount)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
