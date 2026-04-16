import { Copy, Play, Loader2, Trash2, Cpu, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatModelName } from "@/lib/model-utils";
import type { TestStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

export interface ModelTileProps {
  modelId: string;
  alias?: string;
  onCopy: (id: string) => void;
  copied: string | null;
  onTest?: () => void;
  isTesting?: boolean;
  testStatus?: TestStatus;
  onDelete?: () => void;
  className?: string;
  /** TTFT in milliseconds from aggregated DB stats */
  ttftMs?: number | null;
  /** Tokens per second from aggregated DB stats */
  tps?: number | null;
  /** TTFT from most recent client-side test */
  testTtftMs?: number;
  /** TPS from most recent client-side test */
  testTps?: number;
}

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

export function ModelTile({
  modelId,
  alias,
  onCopy,
  copied,
  onTest,
  isTesting,
  testStatus,
  onDelete,
  className,
  ttftMs,
  tps,
  testTtftMs,
  testTps,
}: ModelTileProps) {
  // Use alias (full model ID with prefix) or fall back to modelId
  const fullModelId = alias ?? modelId;
  // Extract just the model name part (after the last slash)
  const modelNameOnly = fullModelId.includes("/")
    ? fullModelId.split("/").slice(1).join("/")
    : modelId;

  const formattedName = formatModelName(modelNameOnly);

  // Prefer client-side test stats, fall back to aggregated DB stats
  const displayTtft = testTtftMs ?? ttftMs;
  const displayTps = testTps ?? tps;
  const hasStats = displayTtft != null || displayTps != null;

  return (
    <TooltipProvider>
      <div
        className={cn(
          "group flex items-center gap-2.5 px-3 py-2 rounded-lg border bg-surface-container-low/30 transition-all hover:bg-surface-container-low/60",
          testStatus === "ok" && "border-green-500/30 bg-green-500/5",
          testStatus === "error" && "border-red-500/30 bg-red-500/5",
          !testStatus && "border-outline-variant",
          className
        )}
      >
        <div className="shrink-0">
          {testStatus === "ok" ? (
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          ) : testStatus === "error" ? (
            <AlertCircle className="w-4 h-4 text-red-500" />
          ) : (
            <Cpu className="w-4 h-4 text-on-surface-variant" />
          )}
        </div>

        <div className="flex-1 min-w-0 overflow-hidden">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-on-surface truncate">
                  {formattedName}
                </span>
                <span className="text-[10px] font-mono text-on-surface-variant/70 truncate">
                  {fullModelId}
                </span>
                {hasStats && (
                  <span className="text-[10px] text-on-surface-variant/60 mt-0.5 flex items-center gap-1.5">
                    {displayTtft != null && (
                      <span>TTFT: {fmtMs(displayTtft)}</span>
                    )}
                    {displayTtft != null && displayTps != null && (
                      <span className="text-on-surface-variant/30">&middot;</span>
                    )}
                    {displayTps != null && (
                      <span>Token/s: {displayTps.toFixed(1)}</span>
                    )}
                  </span>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-75 break-all">
              <p className="font-semibold mb-1">{formattedName}</p>
              <p className="text-xs font-mono">{fullModelId}</p>
              {hasStats && (
                <p className="text-xs mt-1 text-muted-foreground">
                  {displayTtft != null && `TTFT: ${fmtMs(displayTtft)}`}
                  {displayTtft != null && displayTps != null && " · "}
                  {displayTps != null && `Token/s: ${displayTps.toFixed(1)}`}
                </p>
              )}
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onTest && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-7 h-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTest();
                  }}
                  disabled={isTesting}
                >
                  {isTesting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Test Model</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="w-7 h-7"
                onClick={(e) => {
                  e.stopPropagation();
                  onCopy(fullModelId);
                }}
              >
                {copied === fullModelId ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{copied === fullModelId ? "Copied!" : "Copy Model ID"}</TooltipContent>
          </Tooltip>

          {onDelete && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-7 h-7 hover:text-red-500 hover:bg-red-500/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove Model</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
