import { ProviderIcon } from "@/components/ProviderIcon";
import { CheckCircle, XCircle } from "lucide-react";
import type { ProviderCatalog, ProviderNode, ProviderConnection } from "@/lib/api";
import { useProviderMeta } from "./utils";

export function ProviderIconWrapper({
  providerId,
  catalog,
  node,
}: {
  providerId: string;
  catalog?: ProviderCatalog;
  node?: ProviderNode;
}) {
  const { logoPath, isAnthropicCompat, isOpenAICompat } = useProviderMeta(providerId, catalog, node);

  let fallbackColor = "#6B7280";
  let fallbackText = "??";

  if (node) {
    fallbackColor = isAnthropicCompat ? "#D97757" : isOpenAICompat ? "#10A37F" : fallbackColor;
    fallbackText = isAnthropicCompat ? "AC" : isOpenAICompat ? "OC" : fallbackText;
  } else if (catalog) {
    fallbackColor = catalog.color;
    fallbackText = catalog.textIcon;
  }

  return (
    <ProviderIcon
      src={logoPath}
      alt={catalog?.name || node?.name || providerId}
      size={36}
      className="rounded-lg max-w-[36px] max-h-[36px] object-contain"
      fallbackText={fallbackText}
      fallbackColor={fallbackColor}
    />
  );
}

export function TestStatusIndicator({ connection }: { connection: ProviderConnection }) {
  const status = connection.testStatus;
  const lastError = connection.lastError;

  if (!status || status === "unknown") return null;

  if (status === "active" || status === "success") {
    return (
      <div title="Connection is valid">
        <CheckCircle className="w-4 h-4 text-green-500" />
      </div>
    );
  }

  if (status === "error" || status === "expired" || status === "unavailable") {
    return (
      <div className="relative group" title={lastError || "Connection has an error"}>
        <XCircle className="w-4 h-4 text-red-500" />
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
