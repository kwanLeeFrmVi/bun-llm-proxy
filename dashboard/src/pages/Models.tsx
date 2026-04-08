import { useState, useEffect } from "react";
import { api } from "@/lib/api.ts";
import { Box } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const cardStyle = "bg-[--surface-container-lowest] rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)] overflow-hidden";

export default function Models() {
  const [models, setModels] = useState<{ id: string; created?: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.models
      .list()
      .then((data) => setModels(data.data ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-headline text-3xl font-bold tracking-tight text-[--on-surface]">
          Models
        </h1>
        <p className="text-[11px] uppercase tracking-[0.12em] text-[--on-surface-variant] mt-1.5 font-medium">
          Available models from configured providers
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="p-12 text-center">
          <p className="text-[--on-surface-variant] text-sm">Loading…</p>
        </div>
      ) : models.length === 0 ? (
        <div className={cardStyle + " p-12 text-center"}>
          <Box className="w-8 h-8 text-[--on-surface-variant] mx-auto mb-3 opacity-50" />
          <p className="text-[--on-surface-variant] text-sm">No models available.</p>
          <p className="text-[--on-surface-variant] text-xs mt-1">
            Configure a provider to see available models.
          </p>
        </div>
      ) : (
        <div className={cardStyle}>
          {/* Table Header Bar */}
          <div className="px-6 py-4 border-b border-[rgba(203,213,225,0.4)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded bg-[--primary-fixed] text-[--on-primary-fixed]">
                <Box className="w-3.5 h-3.5" />
              </span>
              <span className="text-sm font-semibold text-[--on-surface]">
                {models.length} Models Available
              </span>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="border-b border-[rgba(203,213,225,0.4)]">
                <TableHead className="uppercase text-[11px] tracking-[0.1em] font-semibold text-[--on-surface-variant] py-3 pl-6">
                  Model
                </TableHead>
                <TableHead className="uppercase text-[11px] tracking-[0.1em] font-semibold text-[--on-surface-variant] py-3">
                  Provider
                </TableHead>
                <TableHead className="uppercase text-[11px] tracking-[0.1em] font-semibold text-[--on-surface-variant] py-3 text-right">
                  Created
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {models.map((m, i) => {
                // Extract provider from model ID if possible
                const parts = m.id.split("/");
                const provider = parts.length > 1 ? parts[0] : "—";
                const modelName = parts.length > 1 ? parts.slice(1).join("/") : m.id;
                return (
                  <TableRow
                    key={m.id}
                    className={
                      "border-b border-[rgba(203,213,225,0.25)] hover:bg-[--surface-container-low]/50 transition-colors" +
                      (i % 2 === 1 ? " bg-[--surface-container-low]/40" : "")
                    }
                  >
                    <TableCell className="pl-6 py-3">
                      <Badge variant="endpoint">{modelName}</Badge>
                    </TableCell>
                    <TableCell className="text-[13px] text-[--on-surface-variant] capitalize py-3">
                      {provider}
                    </TableCell>
                    <TableCell className="text-[13px] text-right text-[--on-surface] py-3">
                      {m.created
                        ? new Date(m.created * 1000).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
