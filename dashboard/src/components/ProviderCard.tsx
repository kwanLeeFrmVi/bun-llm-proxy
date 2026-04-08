import { Link } from "react-router-dom";
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { ProviderIcon } from "@/components/ProviderIcon";
import { Play, CheckCircle, XCircle, Loader2 } from "lucide-react";
import type { ProviderCatalog, ProviderNode, ProviderConnection } from "@/lib/api";
import { isOpenAICompatibleProvider, isAnthropicCompatibleProvider } from "@/constants/providers";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface ProviderStats {
  connected: number;
  error: number;
  total: number;
  connections?: ProviderConnection[];
  lastError?: string | null;
  errorCode?: string | null;
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

/**
 * Get the logo path for a provider based on its type and configuration.
 */
function getLogoPath(providerId: string, node?: ProviderNode): string {
  // Handle compatible providers first
  if (node) {
    if (isAnthropicCompatibleProvider(node.type ?? "")) {
      return "/providers/anthropic-m.webp";
    }
    if (isOpenAICompatibleProvider(node.type ?? "")) {
      // Use oai-r.webp for Responses API, oai-cc.webp for Chat Completions
      return node.apiType === "responses" ? "/providers/oai-r.webp" : "/providers/oai-cc.webp";
    }
  }

  // For catalog providers, try to match logo by provider ID
  return `/providers/${providerId}.webp`;
}

function ProviderIconWrapper({ providerId, catalog, node }: {
  providerId: string;
  catalog?: ProviderCatalog;
  node?: ProviderNode;
}) {
  const logoSrc = getLogoPath(providerId, node);

  // Determine fallback color and text
  let fallbackColor = "#6B7280";
  let fallbackText = "??";

  if (node) {
    fallbackColor = isAnthropicCompatibleProvider(node.type ?? "") ? "#D97757" : "#10A37F";
    fallbackText = isAnthropicCompatibleProvider(node.type ?? "") ? "AC" : "OC";
  } else if (catalog) {
    fallbackColor = catalog.color;
    fallbackText = catalog.textIcon;
  }

  return (
    <ProviderIcon
      src={logoSrc}
      alt={catalog?.name || node?.name || providerId}
      size={36}
      className="rounded-lg max-w-[36px] max-h-[36px] object-contain"
      fallbackText={fallbackText}
      fallbackColor={fallbackColor}
    />
  );
}

/**
 * Test status indicator component
 */
function TestStatusIndicator({ connection }: { connection: ProviderConnection }) {
  const status = connection.testStatus;
  const lastError = connection.lastError;

  if (!status || status === "unknown") {
    return null;
  }

  const isActive = status === "active" || status === "success";
  const isError = status === "error" || status === "expired" || status === "unavailable";

  if (isActive) {
    return (
      <div title="Connection is valid">
        <CheckCircle className="w-4 h-4 text-green-500" />
      </div>
    );
  }

  if (isError) {
    return (
      <div
        className="relative group"
        title={lastError || "Connection has an error"}
      >
        <XCircle className="w-4 h-4 text-red-500" />
        {/* Tooltip */}
        {lastError && (
          <div className="absolute bottom-full right-0 mb-2 w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
            <div className="font-medium mb-1">Error</div>
            <div className="text-gray-300 break-words">{lastError}</div>
          </div>
        )}
      </div>
    );
  }

  return null;
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
  const [testing, setTesting] = useState(false);

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

  // Find the first connection for this provider (for test button)
  const connections = stats.connections || [];
  const firstConnection = connections[0];

  const handleTest = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!firstConnection) {
      toast.error("No connection to test");
      return;
    }

    setTesting(true);
    try {
      const result = await api.providers.test(firstConnection.id);
      if (result.valid) {
        toast.success(`Connection tested successfully (${result.latencyMs}ms)`);
      } else {
        toast.error(`Test failed: ${result.error || "Unknown error"}`);
      }
      // Refresh the page data
      window.location.reload();
    } catch (err) {
      toast.error(`Test failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Link
      to={href}
      className={`group flex items-center justify-between p-3 rounded-xl border border-[rgba(203,213,225,0.6)] bg-[--surface-container-lowest] shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] hover:border-[rgba(203,213,225,0.9)] transition-all duration-150 cursor-pointer ${allDisabled ? "opacity-60" : ""}`}
    >
      {/* Left: icon + name */}
      <div className="flex items-center gap-3 min-w-0">
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
            {node && (
              <span className="inline-flex items-center text-xs px-1.5 py-0.5 rounded bg-[--surface-container-low] text-[--on-surface-variant]">
                {isAnthropicCompatibleProvider(node.type ?? "") ? "Messages" : node.apiType === "responses" ? "Responses" : "Chat"}
              </span>
            )}
            {firstConnection && (
              <TestStatusIndicator connection={firstConnection} />
            )}
          </div>
        </div>
      </div>

      {/* Right: toggle + test */}
      {total > 0 && (
        <div className="flex items-center gap-2 ml-2">
          {/* Test button */}
          {firstConnection && (
            <button
              onClick={handleTest}
              disabled={testing}
              className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              title="Test connection"
            >
              {testing ? (
                <Loader2 className="w-4 h-4 text-[--on-surface-variant] animate-spin" />
              ) : (
                <Play className="w-4 h-4 text-[--on-surface-variant]" />
              )}
            </button>
          )}
          {/* Toggle */}
          {onToggle && (
            <div
              className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(!allDisabled); }}
            >
              <Switch checked={!allDisabled} />
            </div>
          )}
        </div>
      )}
    </Link>
  );
}
