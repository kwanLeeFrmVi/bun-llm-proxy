import { useState, useEffect, useRef, useCallback } from "react";
import { Terminal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { ConsoleLogEntry } from "@/lib/types.ts";

const LEVEL_COLORS: Record<string, string> = {
  info: "text-cyan-400",
  log: "text-slate-100",
  warn: "text-yellow-400",
  error: "text-red-400",
  debug: "text-gray-500",
};

const cardStyle =
  "bg-[--surface-container-lowest] rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)] overflow-hidden";

export default function Logs() {
  const [logs, setLogs] = useState<ConsoleLogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);
  const atBottomRef = useRef(true);

  const scrollToBottom = useCallback(() => {
    if (!autoScroll || !containerRef.current) return;
    containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [autoScroll]);

  useEffect(() => {
    fetch("/api/console-logs", {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
      },
    })
      .then((r) => r.json())
      .then((data: ConsoleLogEntry[]) => setLogs(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const es = new EventSource("/api/console-logs/stream");
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const entry: ConsoleLogEntry = JSON.parse(e.data);
        if ("type" in entry && (entry as { type?: string }).type === "clear") {
          setLogs([]);
        } else {
          setLogs((prev) => [...prev.slice(-999), entry]);
        }
      } catch {
        /* ignore parse errors */
      }
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [logs, scrollToBottom]);

  function handleScroll() {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    atBottomRef.current = scrollHeight - scrollTop - clientHeight < 40;
    setAutoScroll(atBottomRef.current);
  }

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Header */}
      <div>
        <h1 className="font-headline text-2xl sm:text-3xl font-bold tracking-tight text-[--on-surface]">
          Console
        </h1>
        <p className="text-xs uppercase tracking-[0.12em] text-[--on-surface-variant] mt-1 sm:mt-1.5 font-medium">
          Real-time request logs
        </p>
      </div>

      {/* Toolbar + Terminal in a card */}
      <div className={cardStyle + " flex-1 flex flex-col overflow-hidden"}>
        {/* Toolbar */}
        <div className="px-6 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[rgba(203,213,225,0.4)] shrink-0">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[--primary-fixed] text-[--on-primary-fixed]">
              <Terminal className="w-4 h-4" />
            </span>
            <span className="text-sm font-semibold text-[--on-surface]">Console Logs</span>
            <Badge variant="secondary" className="text-xs font-medium">
              {logs.length} lines
            </Badge>
          </div>
          <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
            <div className="flex items-center gap-2">
              <Switch id="auto-scroll" checked={autoScroll} onCheckedChange={setAutoScroll} />
              <Label
                htmlFor="auto-scroll"
                className="text-xs text-[--on-surface-variant] font-medium cursor-pointer"
              >
                Auto-scroll
              </Label>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLogs([])}
              className="h-8 text-xs font-medium border-[rgba(203,213,225,0.6)]"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Clear
            </Button>
          </div>
        </div>

        {/* Terminal Output */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto bg-[#0d1117] p-4 font-mono text-sm leading-relaxed"
          style={{ borderRadius: "0 0 0.625rem 0.625rem" }}
        >
          {logs.map((entry) => (
            <div key={entry.id} className={`${LEVEL_COLORS[entry.level] ?? "text-slate-100"}`}>
              <span className="text-gray-600">
                [{entry.timestamp.split("T")[1]?.split(".")[0]}]
              </span>{" "}
              <span className="text-gray-500 uppercase text-xs mr-1">[{entry.level}]</span>
              {entry.message}
            </div>
          ))}
          {logs.length === 0 && (
            <div className="text-gray-600 italic">No logs yet. Waiting for output…</div>
          )}
        </div>
      </div>
    </div>
  );
}
