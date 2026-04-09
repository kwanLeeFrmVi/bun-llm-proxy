import { useState, useEffect, useMemo, useCallback } from "react";
import { api } from "@/lib/api.ts";
import {
  Box,
  Search,
  ArrowUpDown,
  Layers,
  Plus,
  Trash2,
  Pencil,
  X,
  ChevronUp,
  ChevronDownIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaginationControls } from "@/components/PaginationControls";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxList,
  ComboboxItem,
} from "@/components/ui/combobox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

const PROVIDER_NAMES: Record<string, string> = {
  cc: "Claude Code",
  cx: "OpenAI Codex",
  gc: "Gemini CLI",
  qw: "Qwen Code",
  if: "iFlow AI",
  ag: "Antigravity",
  gh: "GitHub Copilot",
  kr: "Kiro AI",
  cu: "Cursor IDE",
  kc: "KiloCode",
  cl: "Cline",
  kmc: "Kimi Coding",
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  openrouter: "OpenRouter",
  glm: "GLM",
  "glm-cn": "GLM (China)",
  kimi: "Kimi",
  "kimi-coding": "Kimi Coding",
  Claude: "Claude",
  "Claude-cn": "Claude (China)",
  alicode: "AliCode",
  "alicode-intl": "AliCode International",
  groq: "Groq",
  xai: "xAI",
  mistral: "Mistral",
  perplexity: "Perplexity",
  together: "Together AI",
  fireworks: "Fireworks",
  cerebras: "Cerebras",
  cohere: "Cohere",
  nvidia: "NVIDIA",
  nebius: "Nebius",
  siliconflow: "SiliconFlow",
  hyperbolic: "Hyperbolic",
  ollama: "Ollama",
  vertex: "Google Vertex AI",
  "vertex-partner": "Vertex AI Partner",
};

type SortKey = "model" | "provider" | "created";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 20;
const cardStyle =
  "bg-[--surface-container-lowest] rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)] overflow-hidden";
const VALID_NAME_REGEX = /^[a-zA-Z0-9_.\-]+$/;

type ModelEntry = {
  id: string;
  created?: number;
  owned_by?: string;
  combo_id?: string;
  combo_models?: string[];
};

type Combo = {
  id: string;
  name: string;
  models: string[];
  createdAt?: string;
  updatedAt?: string;
};

export default function Models() {
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
        case "created":
          cmp = (a.created ?? 0) - (b.created ?? 0);
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
  const [editingComboModels, setEditingComboModels] = useState<string[]>([]);

  const refreshModels = useCallback(() => {
    api.models
      .list()
      .then((d) => setModels(d.data ?? []))
      .catch(() => {});
  }, []);

  const openCreateCombo = useCallback(() => {
    setEditingComboId(null);
    setEditingComboName("");
    setEditingComboModels([]);
    setComboDialogOpen(true);
  }, []);

  const openEditCombo = useCallback(
    (comboId: string, comboName: string, comboModels: string[]) => {
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
        await api.combos.remove(comboId);
        refreshModels();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Failed to delete");
      }
    },
    [refreshModels],
  );

  const handleComboSaved = useCallback(
    async (name: string, comboModels: string[]) => {
      try {
        if (editingComboId) {
          await api.combos.update(editingComboId, {
            name: name.trim(),
            models: comboModels,
          });
        } else {
          await api.combos.create({ name: name.trim(), models: comboModels });
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
        <h1 className='font-headline text-2xl sm:text-3xl font-bold tracking-tight text-[--on-surface]'>
          Models
        </h1>
        <p className='text-xs uppercase tracking-[0.12em] text-[--on-surface-variant] mt-1 sm:mt-1.5 font-medium'>
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
          <p className='text-[--on-surface-variant] text-sm'>Loading…</p>
        </div>
      ) : models.length === 0 ? (
        <div className={cardStyle + " p-12 text-center"}>
          <Box className='w-8 h-8 text-[--on-surface-variant] mx-auto mb-3 opacity-50' />
          <p className='text-[--on-surface-variant] text-sm'>
            No models available.
          </p>
          <p className='text-[--on-surface-variant] text-xs mt-1'>
            Configure a provider to see available models.
          </p>
        </div>
      ) : (
        <div className={cardStyle}>
          {/* Table Header Bar */}
          <div className='px-6 py-4 border-b border-[rgba(203,213,225,0.4)] flex items-center justify-between gap-4 flex-wrap'>
            <div className='flex items-center gap-2'>
              <span className='inline-flex items-center justify-center w-7 h-7 rounded bg-[--primary-fixed] text-[--on-primary-fixed]'>
                <Box className='w-3.5 h-3.5' />
              </span>
              <span className='text-sm font-semibold text-[--on-surface]'>
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
                  className='h-8 text-xs w-40'
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
                className='h-8 text-xs gap-1.5 border-[rgba(203,213,225,0.4)] bg-[--surface-container-low]'
                onClick={openCreateCombo}
              >
                <Layers className='w-3.5 h-3.5' />
                Combos
              </Button>

              {/* Search */}
              <div className='relative w-full max-w-xs'>
                <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[--on-surface-variant] opacity-60' />
                <Input
                  placeholder='Search models or providers...'
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                  className='pl-9 h-8 text-sm bg-[--surface-container-low] border-[rgba(203,213,225,0.4)]'
                />
              </div>
            </div>
          </div>

          <Table stickyHeader>
            <TableHeader>
              <TableRow className='border-b border-[rgba(203,213,225,0.4)]'>
                <TableHead
                  className='uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 pl-6 cursor-pointer select-none hover:text-[--on-surface] transition-colors'
                  onClick={() => toggleSort("model")}
                >
                  <span className='inline-flex items-center gap-1'>
                    Model
                    <ArrowUpDown className='w-3 h-3 opacity-50' />
                    {sortKey === "model" && (
                      <span className='text-[--primary]'>
                        {sortDir === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </span>
                </TableHead>
                <TableHead
                  className='uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 cursor-pointer select-none hover:text-[--on-surface] transition-colors'
                  onClick={() => toggleSort("provider")}
                >
                  <span className='inline-flex items-center gap-1'>
                    Provider
                    <ArrowUpDown className='w-3 h-3 opacity-50' />
                    {sortKey === "provider" && (
                      <span className='text-[--primary]'>
                        {sortDir === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </span>
                </TableHead>
                <TableHead className='uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3'>
                  Alias Models
                </TableHead>
                <TableHead className='uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 w-10'></TableHead>
                <TableHead
                  className='uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 text-right cursor-pointer select-none hover:text-[--on-surface] transition-colors'
                  onClick={() => toggleSort("created")}
                >
                  <span className='inline-flex items-center gap-1 justify-end'>
                    Created
                    <ArrowUpDown className='w-3 h-3 opacity-50' />
                    {sortKey === "created" && (
                      <span className='text-[--primary]'>
                        {sortDir === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </span>
                </TableHead>
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
                      "border-b border-[rgba(203,213,225,0.25)] hover:bg-[--surface-container-low]/50 transition-colors" +
                      ((page * PAGE_SIZE + i) % 2 === 1
                        ? " bg-[--surface-container-low]/40"
                        : "")
                    }
                  >
                    <TableCell className='pl-6 py-3'>
                      <Badge variant='endpoint'>{modelName}</Badge>
                    </TableCell>
                    <TableCell className='text-sm text-[--on-surface-variant] py-3'>
                      {providerName}
                    </TableCell>
                    <TableCell className='text-sm text-[--on-surface-variant] py-3 max-w-xs'>
                      {isCombo &&
                      m.combo_models &&
                      m.combo_models.length > 0 ? (
                        <div className='flex flex-wrap gap-1'>
                          {m.combo_models.map((cm) => (
                            <Badge
                              key={cm}
                              variant='outline'
                              className='text-[10px] px-1.5 py-0'
                            >
                              {cm}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className='text-[--on-surface-variant]/50'>
                          —
                        </span>
                      )}
                    </TableCell>
                    <TableCell className='text-sm text-right text-[--on-surface] py-3'>
                      {m.created
                        ? new Date(m.created * 1000).toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            },
                          )
                        : "—"}
                    </TableCell>
                    <TableCell className='py-3 pr-4'>
                      {isCombo && m.combo_id ? (
                        <div className='flex gap-1 justify-end'>
                          <button
                            onClick={() =>
                              openEditCombo(
                                m.combo_id!,
                                m.id,
                                m.combo_models ?? [],
                              )
                            }
                            className='p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/5 text-[--on-surface-variant] hover:text-[--primary] transition-colors'
                            title='Edit combo'
                          >
                            <Pencil className='w-3.5 h-3.5' />
                          </button>
                          <button
                            onClick={() => handleDeleteCombo(m.combo_id!)}
                            className='p-1.5 rounded hover:bg-red-500/10 text-[--on-surface-variant] hover:text-red-500 transition-colors'
                            title='Delete combo'
                          >
                            <Trash2 className='w-3.5 h-3.5' />
                          </button>
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
        allModels={models
          .filter((m) => getAlias(m) !== "combo")
          .map((m) => m.id)}
        onSave={handleComboSaved}
        onClose={() => setComboDialogOpen(false)}
      />
    </div>
  );
}

/* ── Combo Form Dialog (Create / Edit) with searchable multi-select ──── */

function ComboFormDialog({
  isOpen,
  comboId,
  initialName,
  initialModels,
  allModels,
  onSave,
  onClose,
}: {
  isOpen: boolean;
  comboId: string | null;
  initialName: string;
  initialModels: string[];
  allModels: string[];
  onSave: (name: string, models: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [modelSearch, setModelSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState("");

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setSelected([...initialModels]);
      setModelSearch("");
      setNameError("");
    }
  }, [isOpen, initialName, initialModels]);

  const validateName = (v: string) => {
    if (!v.trim()) {
      setNameError("Name is required");
      return false;
    }
    if (!VALID_NAME_REGEX.test(v)) {
      setNameError("Only a-z, A-Z, 0-9, -, _ and . allowed");
      return false;
    }
    setNameError("");
    return true;
  };

  const toggleModel = (modelId: string) => {
    setSelected((prev) =>
      prev.includes(modelId)
        ? prev.filter((m) => m !== modelId)
        : [...prev, modelId],
    );
  };

  const removeModel = (modelId: string) => {
    setSelected((prev) => prev.filter((m) => m !== modelId));
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const arr = [...selected];
    [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
    setSelected(arr);
  };

  const moveDown = (index: number) => {
    if (index === selected.length - 1) return;
    const arr = [...selected];
    [arr[index], arr[index + 1]] = [arr[index + 1], arr[index]];
    setSelected(arr);
  };

  const handleSave = async () => {
    if (!validateName(name)) return;
    setSaving(true);
    await onSave(name.trim(), selected);
    setSaving(false);
  };

  // Filter available models (not already selected) by search
  const available = useMemo(() => {
    const q = modelSearch.toLowerCase();
    return allModels
      .filter((m) => !selected.includes(m))
      .filter((m) => m.toLowerCase().includes(q));
  }, [allModels, selected, modelSearch]);

  const isEdit = !!comboId;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className='max-w-md max-h-[85vh] flex flex-col'>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Combo" : "Create Combo"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update combo name and models"
              : "Create a model combo with fallback support"}
          </DialogDescription>
        </DialogHeader>

        <div className='flex flex-col gap-4 py-2 overflow-y-auto flex-1 -mx-6 px-6'>
          {/* Name */}
          <div className='space-y-1.5'>
            <Label htmlFor='combo-name'>Combo Name</Label>
            <Input
              id='combo-name'
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (e.target.value) validateName(e.target.value);
                else setNameError("");
              }}
              placeholder='my-combo'
              className={nameError ? "border-red-400" : ""}
            />
            {nameError && (
              <p className='text-[10px] text-red-500 mt-0.5'>{nameError}</p>
            )}
            {!nameError && (
              <p className='text-[10px] text-[--on-surface-variant] mt-0.5'>
                Only a-z, A-Z, 0-9, -, _ and . allowed
              </p>
            )}
          </div>

          {/* Selected models (ordered list) */}
          <div className='space-y-1.5'>
            <Label>Selected Models ({selected.length})</Label>
            {selected.length > 0 ? (
              <ScrollArea className='h-[180px] rounded-md border border-[rgba(203,213,225,0.4)] p-2'>
                <div className='flex flex-col gap-1'>
                  {selected.map((model, index) => (
                    <div
                      key={model}
                      className='flex items-center gap-1.5 px-2 py-1 rounded-md bg-black/2 dark:bg-white/2 hover:bg-black/4 dark:hover:bg-white/4 transition-colors'
                    >
                      <Badge
                        variant='outline'
                        className='text-[10px] h-4 w-4 p-0 flex items-center justify-center shrink-0 font-mono'
                      >
                        {index + 1}
                      </Badge>
                      <code className='flex-1 min-w-0 text-xs font-mono text-[--on-surface] truncate'>
                        {model}
                      </code>
                      <div className='flex items-center gap-0.5'>
                        <button
                          onClick={() => moveUp(index)}
                          disabled={index === 0}
                          className={`p-0.5 rounded ${index === 0 ? "text-[--on-surface-variant]/20 cursor-not-allowed" : "text-[--on-surface-variant] hover:text-[--primary]"}`}
                          title='Move up'
                        >
                          <ChevronUp className='w-3 h-3' />
                        </button>
                        <button
                          onClick={() => moveDown(index)}
                          disabled={index === selected.length - 1}
                          className={`p-0.5 rounded ${index === selected.length - 1 ? "text-[--on-surface-variant]/20 cursor-not-allowed" : "text-[--on-surface-variant] hover:text-[--primary]"}`}
                          title='Move down'
                        >
                          <ChevronDownIcon className='w-3 h-3' />
                        </button>
                      </div>
                      <button
                        onClick={() => removeModel(model)}
                        className='p-0.5 hover:bg-red-500/10 rounded text-[--on-surface-variant] hover:text-red-500 transition-all'
                        title='Remove'
                      >
                        <X className='w-3 h-3' />
                      </button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <p className='text-[10px] text-[--on-surface-variant] italic py-2'>
                No models selected — search and pick below
              </p>
            )}
          </div>

          {/* Search & pick models */}
          <div className='space-y-1.5'>
            <Label>Add Models</Label>
            <Command className='rounded-lg border border-[rgba(203,213,225,0.4)]'>
              <CommandInput
                placeholder='Search models...'
                value={modelSearch}
                onValueChange={setModelSearch}
              />
              <CommandList>
                <CommandEmpty>No matching models</CommandEmpty>
                <CommandGroup>
                  {available.slice(0, 50).map((modelId) => (
                    <CommandItem
                      key={modelId}
                      value={modelId}
                      onSelect={() => {
                        toggleModel(modelId);
                        setModelSearch("");
                      }}
                      className='text-xs'
                    >
                      <Plus className='w-3 h-3 text-[--primary] shrink-0 mr-2' />
                      <code className='font-mono text-[--on-surface] truncate'>
                        {modelId}
                      </code>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' size='sm' onClick={onClose}>
            Cancel
          </Button>
          <Button
            size='sm'
            onClick={handleSave}
            disabled={!name.trim() || !!nameError || saving}
          >
            {saving ? "Saving…" : isEdit ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
