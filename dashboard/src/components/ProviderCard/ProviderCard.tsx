import { Link } from "react-router-dom";
import { useMemo } from "react";
import { ProviderCardActions } from "./ProviderCardActions";
import { ProviderIconWrapper, TestStatusIndicator } from "./shared";
import { useProviderMeta } from "./utils";
import { useProviderTest } from "./hooks";
import type { ProviderCardProps } from "./types";

export function ProviderCard({
  providerId,
  catalog,
  node,
  stats,
  onToggle,
  onRefresh,
}: ProviderCardProps) {
  const { connected, error, total } = stats;
  const { name, apiTypeLabel } = useProviderMeta(providerId, catalog, node);

  const allDisabled = useMemo(
    () => total > 0 && connected === 0 && error === 0,
    [total, connected, error],
  );

  const connections = stats.connections ?? [];
  const firstConnection = connections[0];
  const { testing, testConnection } = useProviderTest(firstConnection?.id, onRefresh);

  const href = `/providers/${encodeURIComponent(providerId)}`;

  return (
    <div
      className={`group flex items-center justify-between p-3 rounded-xl border border-[rgba(203,213,225,0.6)] bg-card shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] hover:border-[rgba(203,213,225,0.9)] transition-all duration-150 ${allDisabled ? "opacity-60" : ""}`}
    >
      <Link to={href} className="flex items-center gap-3 min-w-0 flex-1">
        <ProviderIconWrapper providerId={providerId} catalog={catalog} node={node} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[--on-surface] truncate">{name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {connected > 0 ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                {connected} Connected
              </span>
            ) : error > 0 ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                {error} Error
              </span>
            ) : (
              <span className="text-xs text-[--on-surface-variant]">No connections</span>
            )}
            {apiTypeLabel && (
              <span className="inline-flex items-center text-xs px-1.5 py-0.5 rounded bg-[--surface-container-low] text-[--on-surface-variant]">
                {apiTypeLabel}
              </span>
            )}
            {firstConnection && <TestStatusIndicator connection={firstConnection} />}
          </div>
        </div>
      </Link>

      {total > 0 && (
        <ProviderCardActions
          hasConnection={!!firstConnection}
          testing={testing}
          allDisabled={allDisabled}
          onTest={testConnection}
          onToggle={onToggle}
        />
      )}
    </div>
  );
}
