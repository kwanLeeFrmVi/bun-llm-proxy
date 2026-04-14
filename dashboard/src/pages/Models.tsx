import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api.ts";
import { useComboStore } from "@/lib/comboStore.ts";
import { PROVIDER_NAMES } from "@/lib/constants.ts";

interface LocalModelWithWeight {
  model: string;
  weight: number;
}
import {
  Box,
  Search,
  ArrowUpDown,
  Layers,
  Trash2,
  Pencil,
  Copy,
  Check,
  BarChart3,
} from "lucide-react";
import { uniq } from "lodash";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaginationControls } from "@/components/PaginationControls";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxList,
  ComboboxItem,
} from "@/components/ui/combobox";
import { toast } from "sonner";
import ComboFormDialog from "@/components/ComboFormDialog";

type SortKey = "model" | "provider";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 20;

type ModelEntry = {
  id: string;
  created?: number;
  owned_by?: string;
  combo_id?: string;
  combo_models?: string[];
};

export default function Models() {
  const navigate = useNavigate();
  const { combos, deleteCombo: deleteComboFromStore } = useComboStore();
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("provider");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Latest streaming stats per model
  const [latestStats, setLatestStats] = useState<
    Map<string, { ttftMs: number | null; tps: number | null }>
  >(new Map());

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.models.list(),
      useComboStore.getState().loadCombos(),
      api.usage.modelsLatestStats(),
    ])
      .then(([modelsData, , statsData]) => {
        setModels(modelsData.data ?? []);
        const map = new Map<string, { ttftMs: number | null; tps: number | null }>();
        for (const s of statsData.stats ?? []) {
          map.set(s.model, { ttftMs: s.latestTtftMs, tps: s.latestTokensPerSecond });
        }
        setLatestStats(map);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  function getAlias(m: { id: string; owned_by?: string }) {
    const parts = m.id.split("/");
    return m.owned_by ?? (parts.length > 1 ? parts[0] : "");
  }

  function getProviderName(alias: string) {
    if (alias === "combo") return "Custom";
    return PROVIDER_NAMES[alias] ?? alias;
  }

  const providers = useMemo(() => {
    const set = new Map<string, string>();
    for (const m of models) {
      const alias = getAlias(m);
      const name = getProviderName(alias);
      if (!set.has(alias)) set.set(alias, name);
    }
    return Array.from(set.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [models]);

  const filtered = useMemo(() => {
    let result = models;
    if (providerFilter) {
      result = result.filter((m) => getAlias(m) === providerFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((m) => {
        const alias = getAlias(m);
        const providerName = getProviderName(alias);
        const isCombo = alias === "combo";
        const modelName = isCombo
          ? m.id
          : m.id.split("/").length > 1
            ? m.id.split("/").slice(1).join("/")
            : m.id;
        return (
          m.id.toLowerCase().includes(q) ||
          modelName.toLowerCase().includes(q) ||
          providerName.toLowerCase().includes(q) ||
          alias.toLowerCase().includes(q)
        );
      });
    }
    return result;
  }, [models, search, providerFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const aliasA = getAlias(a);
      const aliasB = getAlias(b);
      const isComboA = aliasA === "combo";
      const isComboB = aliasB === "combo";
      const modelNameA = isComboA
        ? a.id
        : a.id.split("/").length > 1
          ? a.id.split("/").slice(1).join("/")
          : a.id;
      const modelNameB = isComboB
        ? b.id
        : b.id.split("/").length > 1
          ? b.id.split("/").slice(1).join("/")
          : b.id;
      const providerA = getProviderName(aliasA);
      const providerB = getProviderName(aliasB);

      let cmp = 0;
      switch (sortKey) {
        case "model":
          cmp = modelNameA.localeCompare(modelNameB);
          break;
        case "provider":
          cmp = providerA.localeCompare(providerB) || modelNameA.localeCompare(modelNameB);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const total = sorted.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const paged = useMemo(
    () => sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [sorted, page]
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const [comboDialogOpen, setComboDialogOpen] = useState(false);
  const [editingComboId, setEditingComboId] = useState<string | null>(null);
  const [editingComboName, setEditingComboName] = useState<string>("");
  const [editingComboModels, setEditingComboModels] = useState<LocalModelWithWeight[]>([]);
  const [editingComboStrategy, setEditingComboStrategy] = useState<string>("fallback");

  const refreshModels = useCallback(() => {
    api.models
      .list()
      .then((d) => setModels(d.data ?? []))
      .catch(() => {});
    useComboStore.getState().loadCombos();
  }, []);

  const openCreateCombo = useCallback(() => {
    setEditingComboId(null);
    setEditingComboName("");
    setEditingComboModels([] as LocalModelWithWeight[]);
    setEditingComboStrategy("fallback");
    setComboDialogOpen(true);
  }, []);

  const openEditCombo = useCallback(
    (
      comboId: string,
      comboName: string,
      comboModels: LocalModelWithWeight[],
      comboStrategy?: string
    ) => {
      setEditingComboId(comboId);
      setEditingComboName(comboName);
      setEditingComboModels([...comboModels]);
      setEditingComboStrategy(comboStrategy || "fallback");
      setComboDialogOpen(true);
    },
    []
  );

  const handleDeleteCombo = useCallback(
    async (comboId: string) => {
      if (!confirm("Delete this combo?")) return;
      try {
        await deleteComboFromStore(comboId);
        toast.success("Combo deleted");
        refreshModels();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to delete");
      }
    },
    [deleteComboFromStore, refreshModels]
  );

  function CopyModelButton({ modelName }: { modelName: string }) {
    const [copied, setCopied] = useState(false);
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 hover:bg-muted focus:opacity-100 h-5 w-5"
            onClick={() => {
              navigator.clipboard.writeText(modelName);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? (
              <Check className="w-3 h-3 text-green-500" />
            ) : (
              <Copy className="w-3 h-3 text-muted-foreground" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-[10px]">
          {copied ? "Copied!" : "Copy alias"}
        </TooltipContent>
      </Tooltip>
    );
  }

  function EditComboButton({
    comboId,
    comboName,
    comboModels,
    comboStrategy,
  }: {
    comboId: string;
    comboName: string;
    comboModels: LocalModelWithWeight[];
    comboStrategy?: string;
  }) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => openEditCombo(comboId, comboName, comboModels, comboStrategy)}
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-[10px]">
          Edit combo
        </TooltipContent>
      </Tooltip>
    );
  }

  function DeleteComboButton({ comboId }: { comboId: string }) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="hover:bg-red-500/10 hover:text-red-500"
            onClick={() => handleDeleteCombo(comboId)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-[10px]">
          Delete combo
        </TooltipContent>
      </Tooltip>
    );
  }

  const handleComboSaved = useCallback(
    async (name: string, comboModels: LocalModelWithWeight[], strategy?: string) => {
      try {
        const store = useComboStore.getState();
        if (editingComboId) {
          await store.updateCombo(editingComboId, name.trim(), comboModels, strategy);
          toast.success("Combo updated");
        } else {
          await store.createCombo(name.trim(), comboModels, strategy);
          toast.success("Combo created");
        }
        setComboDialogOpen(false);
        refreshModels();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    },
    [editingComboId, refreshModels]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Models
        </h1>
        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground mt-1 sm:mt-1.5 font-medium">
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
          <p className="text-muted-foreground text-sm">Loading…</p>
        </div>
      ) : models.length === 0 ? (
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden p-12 text-center">
          <Box className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-50" />
          <p className="text-muted-foreground text-sm">No models available.</p>
          <p className="text-muted-foreground text-xs mt-1">
            Configure a provider to see available models.
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded bg-primary/10 text-primary">
                <Box className="w-3.5 h-3.5" />
              </span>
              <span className="text-sm font-semibold text-foreground">
                {total} Models Available
              </span>
            </div>
            <div className="flex items-center justify-end gap-3 flex-wrap">
              <Combobox
                value={providerFilter ?? ""}
                onValueChange={(value) => {
                  setProviderFilter(value || null);
                  setPage(0);
                }}
              >
                <ComboboxInput
                  placeholder="All Providers"
                  className="h-8 text-xs w-40 border-input bg-background shadow-none"
                />
                <ComboboxContent>
                  <ComboboxEmpty>No provider found.</ComboboxEmpty>
                  <ComboboxList>
                    <ComboboxItem value="">All Providers</ComboboxItem>
                    {providers.map(([alias, name]) => (
                      <ComboboxItem key={alias} value={alias}>
                        {name}
                      </ComboboxItem>
                    ))}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>

              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5 border-input bg-background shadow-none"
                onClick={openCreateCombo}
              >
                <Layers className="w-3.5 h-3.5" />
                Combos
              </Button>

              <div className="relative w-full max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground opacity-60" />
                <Input
                  placeholder="Search models or providers..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage((page) => 0);
                  }}
                  className="pl-9 h-8 text-sm bg-background border-input shadow-none"
                />
              </div>
            </div>
          </div>

          <Table stickyHeader>
            <TableHeader>
              <TableRow className="border-b border-border hover:bg-transparent">
                <TableHead
                  className="uppercase text-xs tracking-widest font-semibold text-muted-foreground py-3 pl-6 cursor-pointer select-none hover:text-foreground transition-colors"
                  onClick={() => toggleSort("model")}
                >
                  <span className="inline-flex items-center gap-1">
                    Model
                    <ArrowUpDown className="w-3 h-3 opacity-50" />
                    {sortKey === "model" && (
                      <span className="text-primary">{sortDir === "asc" ? "↑" : "↓"}</span>
                    )}
                  </span>
                </TableHead>
                <TableHead
                  className="uppercase text-xs tracking-widest font-semibold text-muted-foreground py-3 cursor-pointer select-none hover:text-foreground transition-colors"
                  onClick={() => toggleSort("provider")}
                >
                  <span className="inline-flex items-center gap-1">
                    Provider
                    <ArrowUpDown className="w-3 h-3 opacity-50" />
                    {sortKey === "provider" && (
                      <span className="text-primary">{sortDir === "asc" ? "↑" : "↓"}</span>
                    )}
                  </span>
                </TableHead>
                <TableHead className="uppercase text-xs tracking-widest font-semibold text-muted-foreground py-3">
                  Alias Models
                </TableHead>
                <TableHead className="uppercase text-xs tracking-widest font-semibold text-muted-foreground py-3 text-right">
                  TTFT
                </TableHead>
                <TableHead className="uppercase text-xs tracking-widest font-semibold text-muted-foreground py-3 text-right">
                  Token/s
                </TableHead>
                <TableHead className="uppercase text-xs tracking-widest font-semibold text-muted-foreground py-3 w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((m, i) => {
                const alias = getAlias(m);
                const isCombo = alias === "combo";
                const providerName = getProviderName(alias);
                const modelName = isCombo
                  ? m.id
                  : m.id.split("/").length > 1
                    ? m.id.split("/").slice(1).join("/")
                    : m.id;
                const statsKey = isCombo ? m.id : m.id;
                const stat = latestStats.get(statsKey);
                return (
                  <TableRow
                    key={m.id}
                    className={
                      "group border-b border-border/40 hover:bg-muted/50 transition-colors" +
                      ((page * PAGE_SIZE + i) % 2 === 1 ? " bg-muted/20" : "")
                    }
                  >
                    <TableCell className="pl-6 py-3">
                      <div className="flex items-center">
                        <Badge variant="endpoint">{modelName}</Badge>
                        <CopyModelButton modelName={modelName} />
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground py-3">
                      {providerName}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground py-3 max-w-xs">
                      {(() => {
                        if (!isCombo) return <span className="text-muted-foreground/50">—</span>;
                        const storeCombo = combos.find(
                          (c) => (m.combo_id && c.id === m.combo_id) || c.name === m.id
                        );
                        const displayModels = storeCombo
                          ? storeCombo.models.map((cm) => cm.model)
                          : (m.combo_models ?? []);

                        if (displayModels.length === 0)
                          return <span className="text-muted-foreground/50">—</span>;

                        return (
                          <div className="flex flex-wrap gap-1">
                            {displayModels.map((cm) => (
                              <Badge
                                key={cm}
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 bg-background"
                              >
                                {cm}
                              </Badge>
                            ))}
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground py-3 text-right font-mono">
                      {stat?.ttftMs != null ? (
                        <span>{stat.ttftMs >= 1000 ? `${(stat.ttftMs / 1000).toFixed(1)}s` : `${stat.ttftMs}ms`}</span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground py-3 text-right font-mono">
                      {stat?.tps != null ? (
                        <span>{stat.tps.toFixed(1)}</span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3 pr-4">
                      {isCombo && (m.combo_id || combos.find((c) => c.name === m.id)) ? (
                        <div className="flex gap-1 justify-end">
                          {(() => {
                            const storeCombo = combos.find(
                              (c) => (m.combo_id && c.id === m.combo_id) || c.name === m.id
                            );
                            return (
                              <EditComboButton
                                comboId={m.combo_id || storeCombo?.id || ""}
                                comboName={m.id}
                                comboModels={
                                  storeCombo
                                    ? storeCombo.models
                                    : (m.combo_models ?? []).map((model) => ({
                                        model,
                                        weight: 1,
                                      }))
                                }
                                comboStrategy={storeCombo?.strategy}
                              />
                            );
                          })()}
                          <DeleteComboButton
                            comboId={m.combo_id || combos.find((c) => c.name === m.id)?.id || ""}
                          />
                        </div>
                      ) : (
                        <div className="flex justify-end">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => navigate(`/models/${encodeURIComponent(m.id)}`)}
                              >
                                <BarChart3 className="w-3.5 h-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-[10px]">
                              View stats
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <PaginationControls
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              label="MODELS"
            />
          )}
        </div>
      )}
      <ComboFormDialog
        isOpen={comboDialogOpen}
        comboId={editingComboId}
        initialName={editingComboName}
        initialModels={editingComboModels}
        initialStrategy={editingComboStrategy}
        allModels={uniq([...models.map((m) => m.id), ...combos.map((c) => c.name)])}
        allCombos={combos.map((c) => c.name)}
        allModelTypes={(() => {
          const map = {} as Record<string, "combo" | "model">;
          models.forEach((m) => {
            map[m.id] = getAlias(m) === "combo" ? "combo" : "model";
          });
          combos.forEach((c) => {
            map[c.name] = "combo";
          });
          return map;
        })()}
        onSave={handleComboSaved}
        onClose={() => setComboDialogOpen(false)}
      />
    </div>
  );
}
