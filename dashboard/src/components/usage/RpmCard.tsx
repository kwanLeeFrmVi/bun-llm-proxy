import { Activity } from "lucide-react";

interface RpmCardProps {
  rpmUsed: number;
  rpmLimit: number;
  concurrentUsed?: number;
  concurrentLimit?: number;
}

export function RpmCard({ rpmUsed, rpmLimit, concurrentUsed, concurrentLimit }: RpmCardProps) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl bg-card p-5 border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center justify-center rounded-md bg-blue-500/15 w-7 h-7">
          <Activity className="w-3.5 h-3.5 text-blue-500" />
        </div>
        <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--on-surface-variant)] font-600">
          RPM
        </span>
        <span className="ml-auto text-[12px] text-[var(--on-surface)] font-semibold">
          {rpmUsed}/{rpmLimit}
        </span>
      </div>

      {/* Mini bar chart placeholder (visual indicator) */}
      <div className="flex items-end gap-0.5 h-8 mb-2">
        {Array.from({ length: Math.min(rpmLimit, 20) }).map((_, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm transition-all"
            style={{
              height: `${Math.random() * 80 + 20}%`,
              background: i < rpmUsed ? "rgba(59, 130, 246, 0.7)" : "rgba(59, 130, 246, 0.15)",
            }}
          />
        ))}
      </div>

      <p className="text-[10px] text-[var(--on-surface-variant)] leading-relaxed">
        Max API requests per 60-second window.
      </p>
      <p className="text-[10px] text-[var(--on-surface-variant)]">Resets automatically.</p>

      {concurrentUsed !== undefined && concurrentLimit !== undefined && (
        <div className="mt-3 pt-3 border-t border-[rgba(203,213,225,0.3)]">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--on-surface-variant)] font-600">
              Concurrent
            </span>
            <span className="ml-auto text-[12px] text-[var(--on-surface)] font-semibold">
              {concurrentUsed}/{concurrentLimit}
            </span>
          </div>
          <p className="text-[10px] text-[var(--on-surface-variant)] mt-1">
            Max simultaneous connections.
          </p>
        </div>
      )}
    </div>
  );
}
