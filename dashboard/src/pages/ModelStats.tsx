import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PaginationControls } from "@/components/PaginationControls";
import { ArrowLeft, Play, Loader2 } from "lucide-react";
import { StatusBadge } from "@/components/usage/StatusBadge";
import { cardStyle } from "@/components/usage/utils";
import { toast } from "sonner";
import type { TestStatus } from "@/lib/types";

const PERIODS = ["2h", "5h", "24h", "7d", "30d"] as const;
type Period = (typeof PERIODS)[number];
const PAGE_SIZE = 20;

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={cardStyle + " p-4 flex flex-col gap-1"}>
      <span className="text-xs uppercase tracking-widest font-semibold text-muted-foreground">
        {label}
      </span>
      <span className="text-xl font-bold text-foreground">{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

/** Strip provider prefix so model param matches DB storage: "openai/gpt-4o" → "gpt-4o" */
function normalizeModel(model: string): string {
  const idx = model.indexOf("/");
  return idx >= 0 ? model.slice(idx + 1) : model;
}

function fmtMs(ms: number | null): string {
  if (ms == null) return "—";
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function fmtTps(tps: number | null): string {
  if (tps == null) return "—";
  return tps.toFixed(1);
}

function fmtPct(pct: number): string {
  if (pct === 0) return "0%";
  return pct < 1 ? `${pct.toFixed(1)}%` : `${pct.toFixed(0)}%`;
}

export default function ModelStats() {
  const { modelId } = useParams<{ modelId: string }>();
  const navigate = useNavigate();
  const displayModel = decodeURIComponent(modelId ?? "");
  const model = normalizeModel(displayModel);

  const [period, setPeriod] = useState<Period>("7d");
  const [data, setData] = useState<Awaited<ReturnType<typeof api.usage.modelStats>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>(null);
  const [testTtftMs, setTestTtftMs] = useState<number | undefined>();
  const [testTps, setTestTps] = useState<number | undefined>();

  const load = useCallback(async () => {
    if (!model) return;
    setLoading(true);
    try {
      const result = await api.usage.modelStats(model, period, page + 1, PAGE_SIZE);
      setData(result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [model, period, page]);

  useEffect(() => {
    setPage(0);
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleTest() {
    if (testing) return;
    setTesting(true);
    setTestStatus(null);
    setTestTtftMs(undefined);
    setTestTps(undefined);

    try {
      // Get an API key for authentication
      const apiKeysRes = await api.keys.list();
      const keys = apiKeysRes.keys as Array<{
        isActive?: boolean;
        key?: string;
      }>;
      const activeKey = keys.find((k) => k.isActive !== false)?.key;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (activeKey) {
        headers["Authorization"] = `Bearer ${activeKey}`;
      }

      const start = Date.now();
      const res = await fetch(`${window.location.origin}/v1/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: displayModel,
          max_tokens: 50,
          stream: true,
          messages: [
            { role: "user", content: "Respond with exactly 10 words about the weather today." },
          ],
        }),
        signal: AbortSignal.timeout(15000),
      });

      const contentType = res.headers.get("content-type") ?? "";
      const isStreaming = contentType.includes("text/event-stream");

      let success = false;
      let errorMsg = "";
      let firstChunkTime: number | null = null;
      let completionTokens = 0;

      if (!res.ok) {
        try {
          const errData = await res.json();
          errorMsg = errData?.error?.message ?? `HTTP ${res.status}`;
        } catch {
          errorMsg = `HTTP ${res.status}`;
        }
      } else if (isStreaming) {
        try {
          const reader = res.body?.getReader();
          if (reader) {
            const decoder = new TextDecoder();
            let foundContent = false;
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const now = Date.now();
              const text = decoder.decode(value);
              if (text.includes('"error"')) {
                const match = text.match(/"error":\s*({[^}]+})/);
                if (match) {
                  try {
                    const errObj = JSON.parse(match[1]!);
                    errorMsg = errObj?.message ?? "Stream error";
                  } catch {
                    /* ignore */
                  }
                }
                break;
              }
              if (
                text.includes('"choices"') &&
                (text.includes('"content"') || text.includes('"delta"'))
              ) {
                foundContent = true;
                if (!firstChunkTime) firstChunkTime = now;
              }
              for (const line of text.split("\n")) {
                if (line.startsWith("data: ") && !line.includes("[DONE]")) {
                  try {
                    const data = JSON.parse(line.slice(6));
                    const usageSource =
                      data.usage && typeof data.usage === "object" ? data.usage : null;
                    if (usageSource) {
                      completionTokens =
                        usageSource.completion_tokens ?? usageSource.output_tokens ?? 0;
                    }
                  } catch {
                    /* skip non-JSON lines */
                  }
                }
              }
              if (text.includes("[DONE]")) {
                break;
              }
            }
            success = foundContent;
            if (!foundContent && !errorMsg) {
              errorMsg = "No content in stream";
            }
          }
        } catch (e) {
          errorMsg = e instanceof Error ? e.message : "Stream parse error";
        }
      } else {
        const data = await res.json().catch(() => null);
        if (data?.error) {
          errorMsg = data.error.message ?? "Unknown error";
        } else if (data?.choices?.length) {
          success = true;
          firstChunkTime = Date.now();
          completionTokens = data.usage?.completion_tokens ?? 0;
        } else {
          errorMsg = "No choices in response";
        }
      }

      const totalMs = Date.now() - start;
      const ttftMs = firstChunkTime ? firstChunkTime - start : undefined;
      const tps =
        ttftMs && completionTokens > 0 && totalMs > ttftMs
          ? (completionTokens / (totalMs - ttftMs)) * 1000
          : undefined;

      if (!success) {
        setTestStatus("error");
        toast.error(`Model test failed${errorMsg ? `: ${errorMsg}` : ""}`);
      } else {
        setTestStatus("ok");
        setTestTtftMs(ttftMs);
        setTestTps(tps);
        const ttftStr =
          ttftMs != null
            ? ` | TTFT: ${ttftMs >= 1000 ? `${(ttftMs / 1000).toFixed(1)}s` : `${ttftMs}ms`}`
            : "";
        const tpsStr = tps != null ? ` | Token/s: ${tps.toFixed(1)}` : "";
        toast.success(`Model tested successfully (${totalMs}ms${ttftStr}${tpsStr})`);
        // Refresh stats after a short delay
        setTimeout(() => load(), 500);
      }
    } catch (err) {
      setTestStatus("error");
      toast.error(`Model test failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setTesting(false);
    }
  }

  if (!model) {
    return <div className="p-12 text-center text-muted-foreground">No model specified.</div>;
  }

  const summary = data?.summary;
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => navigate("/models")}
            className="shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="font-headline text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {displayModel}
            </h1>
            {summary?.provider && (
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground mt-1 font-medium">
                {summary.provider}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 text-xs font-medium border-[rgba(203,213,225,0.6)]"
            onClick={handleTest}
            disabled={testing}
          >
            {testing ? (
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 mr-1" />
            )}
            Test Model
          </Button>
          <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <TabsList className="h-8 sm:h-9 bg-[--surface-container-low] rounded-lg p-1">
              {PERIODS.map((p) => (
                <TabsTrigger
                  key={p}
                  value={p}
                  className="h-6 sm:h-7 px-2 sm:px-3 rounded text-xs sm:text-sm font-medium data-[state=active]:bg-[--surface-container-lowest] data-[state=active]:shadow-sm"
                >
                  {p}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Summary Cards */}
      {loading && !data ? (
        <div className="p-12 text-center">
          <p className="text-muted-foreground text-sm">Loading…</p>
        </div>
      ) : summary ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <SummaryCard
              label="Requests"
              value={String(summary.requestCount)}
              sub={`${fmtPct(summary.failedRate)} failed`}
            />
            <SummaryCard
              label="TTFT (avg)"
              value={fmtMs(summary.ttftAvg)}
              sub={`min ${fmtMs(summary.ttftMin)} / max ${fmtMs(summary.ttftMax)}`}
            />
            <SummaryCard
              label="Token/s (avg)"
              value={fmtTps(summary.tpsAvg)}
              sub={`min ${fmtTps(summary.tpsMin)} / max ${fmtTps(summary.tpsMax)}`}
            />
            <SummaryCard
              label="Latency (avg)"
              value={fmtMs(summary.latencyAvg)}
              sub={`min ${fmtMs(summary.latencyMin)} / max ${fmtMs(summary.latencyMax)}`}
            />
            <SummaryCard
              label="Fail Rate"
              value={fmtPct(summary.failedRate)}
              sub={`${summary.failedCount} of ${summary.requestCount}`}
            />
          </div>

          {/* Request Table */}
          <div className={cardStyle}>
            <div className="px-6 py-4 border-b border-border flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">Requests</span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {total}
              </Badge>
            </div>
            {rows.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground text-sm">
                No requests in this period.
              </div>
            ) : (
              <>
                <Table stickyHeader>
                  <TableHeader>
                    <TableRow className="border-b border-border hover:bg-transparent">
                      <TableHead className="uppercase text-xs tracking-widest font-semibold text-muted-foreground py-3 pl-6">
                        Time
                      </TableHead>
                      <TableHead className="uppercase text-xs tracking-widest font-semibold text-muted-foreground py-3">
                        Status
                      </TableHead>
                      <TableHead className="uppercase text-xs tracking-widest font-semibold text-muted-foreground py-3 text-right">
                        Duration
                      </TableHead>
                      <TableHead className="uppercase text-xs tracking-widest font-semibold text-muted-foreground py-3 text-right">
                        TTFT
                      </TableHead>
                      <TableHead className="uppercase text-xs tracking-widest font-semibold text-muted-foreground py-3 text-right">
                        Token/s
                      </TableHead>
                      <TableHead className="uppercase text-xs tracking-widest font-semibold text-muted-foreground py-3 text-right pr-6">
                        Tokens
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r, i) => (
                      <TableRow
                        key={r.id}
                        className={
                          "border-b border-border/40 hover:bg-muted/50 transition-colors" +
                          (i % 2 === 1 ? " bg-muted/20" : "")
                        }
                      >
                        <TableCell className="pl-6 py-2.5 text-sm text-muted-foreground font-mono">
                          {new Date(r.timestamp).toLocaleString()}
                        </TableCell>
                        <TableCell className="py-2.5">
                          <StatusBadge status={r.status} />
                        </TableCell>
                        <TableCell className="py-2.5 text-sm text-right font-mono">
                          {fmtMs(r.durationMs)}
                        </TableCell>
                        <TableCell className="py-2.5 text-sm text-right font-mono">
                          {r.ttftMs != null ? (
                            fmtMs(r.ttftMs)
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2.5 text-sm text-right font-mono">
                          {r.tokensPerSecond != null ? (
                            fmtTps(r.tokensPerSecond)
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2.5 text-sm text-right pr-6 font-mono">
                          {r.promptTokens + r.completionTokens > 0 ? (
                            <span>
                              <span className="text-muted-foreground">{r.promptTokens}</span>
                              <span className="text-muted-foreground/50">/</span>
                              <span>{r.completionTokens}</span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {totalPages > 1 && (
                  <PaginationControls
                    page={page}
                    totalPages={totalPages}
                    total={total}
                    pageSize={PAGE_SIZE}
                    onPageChange={setPage}
                    label="REQUESTS"
                  />
                )}
              </>
            )}
          </div>
        </>
      ) : (
        <div className={cardStyle + " p-12 text-center"}>
          <p className="text-muted-foreground text-sm">No data available for this model.</p>
        </div>
      )}
    </div>
  );
}
