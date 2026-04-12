import { useState, useCallback, useEffect } from "react";
import { api } from "@/lib/api.ts";
import type { UsageRecord } from "@/lib/types.ts";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PaginationControls } from "@/components/PaginationControls";
import { ExternalLink, SlidersHorizontal, X } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { cardStyle } from "./utils";

const PAGE_SIZE = 20;

export function DetailsTab({ apiKeyMap }: { apiKeyMap: Map<string, string> }) {
  const [rows, setRows] = useState<UsageRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [selectedRow, setSelectedRow] = useState<UsageRecord | null>(null);

  // Filters
  const [provider, setProvider] = useState("");
  const [apiKeyId, setApiKeyId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const load = useCallback(
    async (p: number) => {
      setLoading(true);
      try {
        const params: Record<string, string> = {
          limit: String(PAGE_SIZE),
          offset: String(p * PAGE_SIZE),
        };
        if (provider) params.provider = provider;
        if (apiKeyId) params.apiKeyId = apiKeyId;
        if (startDate) params.startDate = new Date(startDate).toISOString();
        if (endDate) params.endDate = new Date(endDate).toISOString();

        const data = (await api.usage.requestDetails(params)) as {
          rows: UsageRecord[];
          total: number;
        };
        setRows(data.rows ?? []);
        setTotal(data.total ?? 0);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [provider, apiKeyId, startDate, endDate]
  );

  useEffect(() => {
    setPage(0);
    load(0);
  }, [load]);

  function handlePage(next: number) {
    setPage(next);
    load(next);
  }

  function clearFilters() {
    setProvider("");
    setApiKeyId("");
    setStartDate("");
    setEndDate("");
    setPage(0);
  }

  const hasFilters = provider || apiKeyId || startDate || endDate;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className={cardStyle + " p-4"}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1 min-w-[140px] sm:min-w-[160px]">
            <label className="text-xs uppercase tracking-[0.12em] font-semibold text-[--on-surface-variant]">
              Provider
            </label>
            <input
              type="text"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              placeholder="e.g. pro-x"
              className="h-9 px-3 text-sm rounded-lg border border-[rgba(203,213,225,0.6)] bg-[--surface-container-low] text-[--on-surface] focus:outline-none focus:border-[--primary] placeholder:text-[--on-surface-variant]/50"
            />
          </div>
          <div className="flex flex-col gap-1 min-w-[150px] sm:min-w-[180px]">
            <label className="text-xs uppercase tracking-[0.12em] font-semibold text-[--on-surface-variant]">
              API Key
            </label>
            <select
              value={apiKeyId}
              onChange={(e) => setApiKeyId(e.target.value)}
              className="h-9 px-3 pr-8 text-sm rounded-lg border border-[rgba(203,213,225,0.6)] bg-[--surface-container-low] text-[--on-surface] focus:outline-none focus:border-[--primary] appearance-none cursor-pointer"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 10px center",
              }}
            >
              <option value="">All API Keys</option>
              {Array.from(apiKeyMap.entries()).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase tracking-[0.12em] font-semibold text-[--on-surface-variant]">
              Start Date
            </label>
            <input
              type="datetime-local"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-9 px-3 text-sm rounded-lg border border-[rgba(203,213,225,0.6)] bg-[--surface-container-low] text-[--on-surface] focus:outline-none focus:border-[--primary]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase tracking-[0.12em] font-semibold text-[--on-surface-variant]">
              End Date
            </label>
            <input
              type="datetime-local"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-9 px-3 text-sm rounded-lg border border-[rgba(203,213,225,0.6)] bg-[--surface-container-low] text-[--on-surface] focus:outline-none focus:border-[--primary]"
            />
          </div>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="h-9 px-4 text-sm font-medium text-[--on-surface-variant] hover:text-[--on-surface] flex items-center gap-1.5 rounded-lg hover:bg-[--surface-container-low] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Clear Filters
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-[--on-surface-variant]" />
            <span className="text-sm text-[--on-surface-variant]">
              {total.toLocaleString()} records
            </span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className={cardStyle}>
        {loading ? (
          <div className="p-12 text-center">
            <p className="text-[--on-surface-variant] text-sm">Loading…</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-[--on-surface-variant] text-sm">No records found.</p>
          </div>
        ) : (
          <>
            <Table stickyHeader className="min-w-full">
              <TableHeader>
                <TableRow className="border-b border-[rgba(203,213,225,0.4)]">
                  <TableHead className="uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 pl-6">
                    Timestamp
                  </TableHead>
                  <TableHead className="uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3">
                    Model
                  </TableHead>
                  <TableHead className="uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 hidden md:table-cell">
                    Provider
                  </TableHead>
                  <TableHead className="uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 hidden lg:table-cell">
                    API Key
                  </TableHead>
                  <TableHead className="uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 text-right hidden sm:table-cell">
                    Input Tokens
                  </TableHead>
                  <TableHead className="uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 text-right hidden sm:table-cell">
                    Output Tokens
                  </TableHead>
                  <TableHead className="uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 text-right">
                    Cost
                  </TableHead>
                  <TableHead className="uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 hidden md:table-cell">
                    Status
                  </TableHead>
                  <TableHead className="uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 hidden lg:table-cell">
                    Latency
                  </TableHead>
                  <TableHead className="uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 pr-6 text-right">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow
                    key={r.id}
                    className={
                      "border-b border-[rgba(203,213,225,0.25)] hover:bg-[--surface-container-low]/50 transition-colors cursor-pointer" +
                      (i % 2 === 1 ? " bg-[--surface-container-low]/40" : "")
                    }
                    onClick={() => setSelectedRow(r)}
                  >
                    <TableCell className="pl-6 py-3 text-sm text-[--on-surface-variant] whitespace-nowrap">
                      {new Date(r.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell className="py-3">
                      <Badge variant="endpoint">{r.model ?? "—"}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-[--on-surface] py-3 hidden md:table-cell">
                      {r.provider ?? "—"}
                    </TableCell>
                    <TableCell className="py-3 hidden lg:table-cell">
                      {r.apiKeyId ? (
                        <Badge variant="secondary">{apiKeyMap.get(r.apiKeyId) ?? r.apiKeyId}</Badge>
                      ) : (
                        <span className="text-sm text-[--on-surface-variant]">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-right tabular-nums text-[--primary] py-3 hidden sm:table-cell">
                      {r.promptTokens.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm text-right tabular-nums text-[--on-surface] py-3 hidden sm:table-cell">
                      {r.completionTokens.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm text-right tabular-nums text-[--on-surface] py-3">
                      ${r.cost.toFixed(5)}
                    </TableCell>
                    <TableCell className="py-3 hidden md:table-cell">
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="text-sm text-[--on-surface-variant] py-3 whitespace-nowrap hidden lg:table-cell">
                      {r.durationMs ? `${r.durationMs.toLocaleString()}ms` : "—"}
                    </TableCell>
                    <TableCell className="pr-6 text-right py-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-3 text-xs font-medium rounded-md"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedRow(r);
                        }}
                      >
                        <ExternalLink className="w-3 h-3 mr-1" />
                        Detail
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination */}
            <PaginationControls
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={PAGE_SIZE}
              onPageChange={handlePage}
              label="RECORDS"
            />
          </>
        )}
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedRow} onOpenChange={(open) => !open && setSelectedRow(null)}>
        <DialogContent className="max-w-2xl bg-[--surface-container-lowest] border border-[rgba(203,213,225,0.6)]">
          <DialogHeader>
            <DialogTitle>Request Detail</DialogTitle>
            <DialogDescription className="font-mono text-xs">
              ID: {selectedRow?.id}
            </DialogDescription>
          </DialogHeader>
          {selectedRow && (
            <div className="space-y-4">
              {/* Key-value grid */}
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ["Timestamp", new Date(selectedRow.timestamp).toLocaleString()],
                    ["Model", selectedRow.model ?? "—"],
                    ["Provider", selectedRow.provider ?? "—"],
                    [
                      "API Key",
                      selectedRow.apiKeyId
                        ? (apiKeyMap.get(selectedRow.apiKeyId) ?? selectedRow.apiKeyId)
                        : "—",
                    ],
                    ["Status", selectedRow.status],
                    ["Duration", selectedRow.durationMs ? `${selectedRow.durationMs}ms` : "—"],
                    ["Prompt Tokens", selectedRow.promptTokens.toLocaleString()],
                    ["Completion Tokens", selectedRow.completionTokens.toLocaleString()],
                    ["Reasoning Tokens", selectedRow.reasoningTokens?.toLocaleString() ?? "0"],
                    ["Cached Tokens", selectedRow.cachedTokens?.toLocaleString() ?? "0"],
                    ["Cost", `$${selectedRow.cost.toFixed(6)}`],
                    ["Endpoint", selectedRow.endpoint ?? "—"],
                  ] as [string, string][]
                ).map(([label, value]) => (
                  <div key={label} className="bg-[--surface-container-low] rounded-lg p-3">
                    <p className="text-xs uppercase tracking-[0.12em] font-semibold text-[--on-surface-variant]">
                      {label}
                    </p>
                    <p className="text-sm font-medium text-[--on-surface] mt-1 break-all">
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Raw JSON */}
              <div>
                <p className="text-xs uppercase tracking-[0.12em] font-semibold text-[--on-surface-variant] mb-2">
                  Raw JSON
                </p>
                <pre className="bg-[--surface-container-low] rounded-lg p-4 text-xs font-mono text-[--on-surface] overflow-auto max-h-56 whitespace-pre-wrap break-all">
                  {JSON.stringify(selectedRow, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
