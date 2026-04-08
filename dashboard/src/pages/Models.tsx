import { useState, useEffect, useMemo } from "react";
import { api } from "@/lib/api.ts";
import { Box, Search, ArrowUpDown, ChevronDown } from "lucide-react";
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

export default function Models() {
  const [models, setModels] = useState<
    { id: string; created?: number; owned_by?: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState<string | null>(null);
  const [providerDropdownOpen, setProviderDropdownOpen] = useState(false);
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
            <div className='flex items-center gap-3 flex-wrap'>
              {/* Provider filter */}
              <div className='relative'>
                <Button
                  variant='outline'
                  size='sm'
                  className='h-8 text-xs gap-1 border-[rgba(203,213,225,0.4)] bg-[--surface-container-low]'
                  onClick={() => setProviderDropdownOpen((v) => !v)}
                >
                  {providerFilter
                    ? getProviderName(providerFilter)
                    : "All Providers"}
                  <ChevronDown className='w-3.5 h-3.5' />
                </Button>
                {providerDropdownOpen && (
                  <>
                    <div
                      className='fixed inset-0 z-20'
                      onClick={() => setProviderDropdownOpen(false)}
                    />
                    <div className='absolute right-0 top-full mt-1 z-30 min-w-[180px] max-h-64 overflow-y-auto rounded-lg border border-[rgba(203,213,225,0.4)] bg-[--surface-container-lowest] shadow-lg py-1'>
                      <button
                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[--surface-container-low] transition-colors ${!providerFilter ? "font-semibold text-[--primary]" : "text-[--on-surface]"}`}
                        onClick={() => {
                          setProviderFilter(null);
                          setPage(0);
                          setProviderDropdownOpen(false);
                        }}
                      >
                        All Providers
                      </button>
                      {providers.map(([alias, name]) => (
                        <button
                          key={alias}
                          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[--surface-container-low] transition-colors ${providerFilter === alias ? "font-semibold text-[--primary]" : "text-[--on-surface]"}`}
                          onClick={() => {
                            setProviderFilter(alias);
                            setPage(0);
                            setProviderDropdownOpen(false);
                          }}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

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
    </div>
  );
}
