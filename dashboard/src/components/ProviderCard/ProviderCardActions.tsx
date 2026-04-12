import { Switch } from "@/components/ui/switch";
import { Play, Loader2 } from "lucide-react";

interface ProviderCardActionsProps {
  /** Whether a connection exists to test */
  hasConnection: boolean;
  /** Whether a test is currently running */
  testing: boolean;
  /** Whether all connections are disabled */
  allDisabled: boolean;
  /** Fire a connection test */
  onTest: () => void;
  /** Toggle the provider active state */
  onToggle?: (active: boolean) => void;
}

export function ProviderCardActions({
  hasConnection,
  testing,
  allDisabled,
  onTest,
  onToggle,
}: ProviderCardActionsProps) {
  return (
    <div className="flex items-center gap-2 ml-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
      {hasConnection && (
        <button onClick={onTest} disabled={testing} title="Test connection">
          {testing ? (
            <Loader2 className="w-4 h-4 text-[--on-surface-variant] animate-spin" />
          ) : (
            <Play className="w-4 h-4 text-[--on-surface-variant]" />
          )}
        </button>
      )}
      {onToggle && <Switch checked={!allDisabled} onCheckedChange={onToggle} />}
    </div>
  );
}
