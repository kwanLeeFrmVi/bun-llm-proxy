import { useState, useEffect, useMemo, useCallback } from "react";
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
} from "lucide-react";
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
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxList,
  ComboboxItem,
} from "@/components/ui/combobox";
import ComboFormDialog from "@/components/ComboFormDialog";

type SortKey = "model" | "provider";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 20;
const cardStyle =
  "bg-[--surface-container-lowest] rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)] overflow-hidden";

type ModelEntry = {
  id: string;
  created?: number;
  owned_by?: string;
  combo_id?: string;
  combo_models?: string[];
};

export default function Models() {
  // Combo store for managing combo state
  const { deleteCombo: deleteComboFromStore } = useComboStore();
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("provider");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    api.models
      .list()
      .then((data) => setModels(data.data ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
    // Load combos for combo management
    useComboStore.getState().loadCombos();
  }, []);

  function getAlias(m: { id: string; owned_by?: string }) {
    const parts = m.id.split("/");
    return m.owned_by ?? (parts.length > 1 ? parts[0] : "");
  }

  function getProviderName(alias: string) {
    if (alias === "combo") return "Custom";
    return PROVIDER_NAMES[alias] ?? alias;
  }

  // Unique providers for filter dropdown
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

    // Filter by provider
    if (providerFilter) {
      result = result.filter((m) => getAlias(m) === providerFilter);
    }

    // Filter by search
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

  // Sort
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
          cmp =
            providerA.localeCompare(providerB) ||
            modelNameA.localeCompare(modelNameB);
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
    [sorted, page],
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  // ── Combo dialog state ──
  const [comboDialogOpen, setComboDialogOpen] = useState(false);
  const [editingComboId, setEditingComboId] = useState<string | null>(null);
  const [editingComboName, setEditingComboName] = useState<string>("");
  const [editingComboModels, setEditingComboModels] = useState<LocalModelWithWeight[]>([]);

  const refreshModels = useCallback(() => {
    api.models
      .list()
      .then((d) => setModels(d.data ?? []))
      .catch(() => {});
  }, []);

  const openCreateCombo = useCallback(() => {
    setEditingComboId(null);
    setEditingComboName("");
    setEditingComboModels([] as LocalModelWithWeight[]);
    setComboDialogOpen(true);
  }, []);

  const openEditCombo = useCallback(
    (comboId: string, comboName: string, comboModels: LocalModelWithWeight[]) => {
      setEditingComboId(comboId);
      setEditingComboName(comboName);
      setEditingComboModels([...comboModels]);
      setComboDialogOpen(true);
    },
    [],
  );

  const handleDeleteCombo = useCallback(
    async (comboId: string) => {
      if (!confirm("Delete this combo?")) return;
      try {
        await deleteComboFromStore(comboId);
        refreshModels();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Failed to delete");
      }
    },
    [deleteComboFromStore, refreshModels],
  );

  // ── Inline table action buttons (live inside Models so they close over state) ──
  function CopyModelButton({ modelName }: { modelName: string }) {
    const [copied, setCopied] = useState(false);

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant='ghost'
            size='icon-xs'
            className='opacity-0 group-hover:opacity-100 transition-opacity ml-2 hover:bg-muted focus:opacity-100 h-5 w-5'
            onClick={() => {
              navigator.clipboard.writeText(modelName);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? (
              <Check className='w-3 h-3 text-green-500' />
            ) : (
              <Copy className='w-3 h-3 text-muted-foreground' />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side='top' className='text-[10px]'>
          {copied ? "Copied!" : "Copy alias"}
        </TooltipContent>
      </Tooltip>
    );
  }

  function EditComboButton({
    comboId,
    comboName,
    comboModels,
  }: {
    comboId: string;
    comboName: string;
    comboModels: LocalModelWithWeight[];
  }) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant='ghost'
            size='icon-sm'
            onClick={() => openEditCombo(comboId, comboName, comboModels)}
          >
            <Pencil className='w-3.5 h-3.5' />
          </Button>
        </TooltipTrigger>
        <TooltipContent side='top' className='text-[10px]'>
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
            variant='ghost'
            size='icon-sm'
            className='hover:bg-red-500/10 hover:text-red-500'
            onClick={() => handleDeleteCombo(comboId)}
          >
            <Trash2 className='w-3.5 h-3.5' />
          </Button>
        </TooltipTrigger>
        <TooltipContent side='top' className='text-[10px]'>
          Delete combo
        </TooltipContent>
      </Tooltip>
    );
  }

  const handleComboSaved = useCallback(
    async (name: string, comboModels: LocalModelWithWeight[]) => {
      try {
        const store = useComboStore.getState();
        if (editingComboId) {
          await store.updateCombo(editingComboId, name.trim(), comboModels);
        } else {
          await store.createCombo(name.trim(), comboModels);
        }
        setComboDialogOpen(false);
        refreshModels();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Failed to save");
      }
    },
    [editingComboId, refreshModels],
  );

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div>
        <h1 className='font-headline text-2xl sm:text-3xl font-bold tracking-tight text-foreground'>
          Models
        </h1>
        <p className='text-xs uppercase tracking-[0.12em] text-muted-foreground mt-1 sm:mt-1.5 font-medium'>
          Available models from configured providers
        </p>
      </div>

      {error && (
        <Alert variant='destructive'>
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className='p-12 text-center'>
          <p className='text-muted-foreground text-sm'>Loading…</p>
        </div>
      ) : models.length === 0 ? (
        <div className='bg-card rounded-xl border border-border shadow-sm overflow-hidden p-12 text-center'>
          <Box className='w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-50' />
          <p className='text-muted-foreground text-sm'>No models available.</p>
          <p className='text-muted-foreground text-xs mt-1'>
            Configure a provider to see available models.
          </p>
        </div>
      ) : (
        <div className='bg-card rounded-xl border border-border shadow-sm overflow-hidden'>
          {/* Table Header Bar */}
          <div className='px-6 py-4 border-b border-border flex items-center justify-between gap-4 flex-wrap'>
            <div className='flex items-center gap-2'>
              <span className='inline-flex items-center justify-center w-7 h-7 rounded bg-primary/10 text-primary'>
                <Box className='w-3.5 h-3.5' />
              </span>
              <span className='text-sm font-semibold text-foreground'>
                {total} Models Available
              </span>
            </div>
            <div className='flex items-center justify-end gap-3 flex-wrap'>
              {/* Provider filter */}
              <Combobox
                value={providerFilter ?? ""}
                onValueChange={(value) => {
                  setProviderFilter(value || null);
                  setPage(0);
                }}
              >
                <ComboboxInput
                  placeholder='All Providers'
                  className='h-8 text-xs w-40 border-input bg-background shadow-none'
                />
                <ComboboxContent>
                  <ComboboxEmpty>No provider found.</ComboboxEmpty>
                  <ComboboxList>
                    <ComboboxItem value=''>All Providers</ComboboxItem>
                    {providers.map(([alias, name]) => (
                      <ComboboxItem key={alias} value={alias}>
                        {name}
                      </ComboboxItem>
                    ))}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>

              {/* Combos button */}
              <Button
                variant='outline'
                size='sm'
                className='h-8 text-xs gap-1.5 border-input bg-background shadow-none'
                onClick={openCreateCombo}
              >
                <Layers className='w-3.5 h-3.5' />
                Combos
              </Button>

              {/* Search */}
              <div className='relative w-full max-w-xs'>
                <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground opacity-60' />
                <Input
                  placeholder='Search models or providers...'
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                  className='pl-9 h-8 text-sm bg-background border-input shadow-none'
                />
              </div>
            </div>
          </div>

          <Table stickyHeader>
            <TableHeader>
              <TableRow className='border-b border-border hover:bg-transparent'>
                <TableHead
                  className='uppercase text-xs tracking-widest font-semibold text-muted-foreground py-3 pl-6 cursor-pointer select-none hover:text-foreground transition-colors'
                  onClick={() => toggleSort("model")}
                >
                  <span className='inline-flex items-center gap-1'>
                    Model
                    <ArrowUpDown className='w-3 h-3 opacity-50' />
                    {sortKey === "model" && (
                      <span className='text-primary'>
                        {sortDir === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </span>
                </TableHead>
                <TableHead
                  className='uppercase text-xs tracking-widest font-semibold text-muted-foreground py-3 cursor-pointer select-none hover:text-foreground transition-colors'
                  onClick={() => toggleSort("provider")}
                >
                  <span className='inline-flex items-center gap-1'>
                    Provider
                    <ArrowUpDown className='w-3 h-3 opacity-50' />
                    {sortKey === "provider" && (
                      <span className='text-primary'>
                        {sortDir === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </span>
                </TableHead>
                <TableHead className='uppercase text-xs tracking-widest font-semibold text-muted-foreground py-3'>
                  Alias Models
                </TableHead>
                <TableHead className='uppercase text-xs tracking-widest font-semibold text-muted-foreground py-3 w-10'></TableHead>
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
                return (
                  <TableRow
                    key={m.id}
                    className={
                      "group border-b border-border/40 hover:bg-muted/50 transition-colors" +
                      ((page * PAGE_SIZE + i) % 2 === 1 ? " bg-muted/20" : "")
                    }
                  >
                    <TableCell className='pl-6 py-3'>
                      <div className='flex items-center'>
                        <Badge variant='endpoint'>{modelName}</Badge>
                        <CopyModelButton modelName={modelName} />
                      </div>
                    </TableCell>
                    <TableCell className='text-sm text-muted-foreground py-3'>
                      {providerName}
                    </TableCell>
                    <TableCell className='text-sm text-muted-foreground py-3 max-w-xs'>
                      {isCombo &&
                      m.combo_models &&
                      m.combo_models.length > 0 ? (
                        <div className='flex flex-wrap gap-1'>
                          {m.combo_models.map((cm) => (
                            <Badge
                              key={cm}
                              variant='outline'
                              className='text-[10px] px-1.5 py-0 bg-background'
                            >
                              {cm}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className='text-muted-foreground/50'>—</span>
                      )}
                    </TableCell>
                    <TableCell className='py-3 pr-4'>
                      {isCombo && m.combo_id ? (
                        <div className='flex gap-1 justify-end'>
                          <EditComboButton
                            comboId={m.combo_id}
                            comboName={m.id}
                            comboModels={(m.combo_models ?? []).map(model => ({ model, weight: 1 }))}
                          />
                          <DeleteComboButton comboId={m.combo_id} />
                        </div>
                      ) : null}
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
              label='MODELS'
            />
          )}
        </div>
      )}
      {/* ── Combo Form Dialog ── */}
      <ComboFormDialog
        isOpen={comboDialogOpen}
        comboId={editingComboId}
        initialName={editingComboName}
        initialModels={editingComboModels}
        allModels={[...models.map((m) => m.id), ...useComboStore.getState().combos.map((c) => c.name)]}
        allCombos={useComboStore.getState().combos.map((c) => c.name)}
        allModelTypes={(() => {
          const map = {} as Record<string, "combo" | "model">;
          models.forEach((m) => {
            map[m.id] = getAlias(m) === "combo" ? "combo" : "model";
          });
          useComboStore.getState().combos.forEach((c) => {
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
