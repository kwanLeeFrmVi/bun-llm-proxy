import { Link } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import type { ProviderCatalog, ProviderNode } from "@/lib/api";
import { getProviderConfig } from "@/constants/providers";
import { isOpenAICompatibleProvider, isAnthropicCompatibleProvider } from "@/constants/providers";

interface ProviderStats {
  connected: number;
  error: number;
  total: number;
}

interface ProviderCardProps {
  providerId: string;
  catalog?: ProviderCatalog;
  node?: ProviderNode;
  stats: ProviderStats;
  authType?: string;
  onToggle?: (active: boolean) => void;
  onClick?: () => void;
}

function ProviderIcon({ providerId, catalog, node }: {
  providerId: string;
  catalog?: ProviderCatalog;
  node?: ProviderNode;
}) {
  // Determine color and textIcon
  let color = "#6B7280";
  let textIcon = "??";

  if (node) {
    color = isAnthropicCompatibleProvider(node.type ?? "") ? "#D97757" : "#10A37F";
    textIcon = isAnthropicCompatibleProvider(node.type ?? "") ? "AC" : "OC";
  } else if (catalog) {
    color = catalog.color;
    textIcon = catalog.textIcon;
  }

  return (
    <span
      className="inline-flex items-center justify-center w-9 h-9 rounded-lg font-bold text-sm text-white shrink-0"
      style={{ backgroundColor: color }}
    >
      {textIcon}
    </span>
  );
}

export function ProviderCard({
  providerId,
  catalog,
  node,
  stats,
  authType,
  onToggle,
}: ProviderCardProps) {
  const { connected, error, total } = stats;
  const isOAuth = authType === "oauth" || authType === "free";
  const isDisabled = total > 0 && stats.connected === 0 && error === 0;
  const allDisabled = total > 0 && isDisabled;

  // Determine display name
  let name = providerId;
  if (node) {
    name = node.name ?? (isAnthropicCompatibleProvider(node.type ?? "") ? "Anthropic Compatible" : "OpenAI Compatible");
  } else if (catalog) {
    name = catalog.name;
  }

  const href = `/providers/${encodeURIComponent(providerId)}`;

  return (
    <Link
      to={href}
      className={`group flex items-center justify-between p-3 rounded-xl border border-[rgba(203,213,225,0.6)] bg-[--surface-container-lowest] shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] hover:border-[rgba(203,213,225,0.9)] transition-all duration-150 cursor-pointer ${allDisabled ? "opacity-60" : ""}`}
    >
      {/* Left: icon + name */}
      <div className="flex items-center gap-3 min-w-0">
        <ProviderIcon providerId={providerId} catalog={catalog} node={node} />
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
            {node && (
              <span className="inline-flex items-center text-xs px-1.5 py-0.5 rounded bg-[--surface-container-low] text-[--on-surface-variant]">
                {isAnthropicCompatibleProvider(node.type ?? "") ? "Messages" : node.apiType === "responses" ? "Responses" : "Chat"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Right: toggle */}
      {total > 0 && onToggle && (
        <div
          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(!allDisabled); }}
        >
          <Switch checked={!allDisabled} />
        </div>
      )}
    </Link>
  );
}
