import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api, CatalogResponse, ProviderNode, ProviderConnection } from "@/lib/api";
import {
  isOpenAICompatibleProvider,
  isAnthropicCompatibleProvider,
} from "@/constants/providers";
import { ProviderCard } from "@/components/ProviderCard";
import { AddOpenAICompatibleModal } from "@/components/AddOpenAICompatibleModal";
import { AddAnthropicCompatibleModal } from "@/components/AddAnthropicCompatibleModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Play, Search } from "lucide-react";
import { toast } from "sonner";

// Fix the typo in import
import { isOpenAICompatibleProvider as isOpenAICompatible, isAnthropicCompatibleProvider as isAnthropicCompatible } from "@/constants/providers";

interface ProviderStats {
  connected: number;
  error: number;
  total: number;
}

// Group type for provider sections
type ProviderGroup = "oauth" | "free" | "freeTier" | "apiKey" | "compatible";

// ─── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({ title, testAllLoading, onTestAll }: {
  title: string;
  testAllLoading: boolean;
  onTestAll: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-semibold text-[--on-surface] tracking-wide">{title}</h2>
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-2.5 text-xs font-medium border-[rgba(203,213,225,0.6)] text-[--on-surface-variant] hover:text-[--on-surface]"
        onClick={onTestAll}
        disabled={testAllLoading}
      >
        <Play className="w-3 h-3 mr-1" />
        {testAllLoading ? "Testing..." : "Test All"}
      </Button>
    </div>
  );
}

// ─── Provider section card ──────────────────────────────────────────────────────

function ProviderSection({ title, testAllLoading, onTestAll, children }: {
  title: string;
  testAllLoading: boolean;
  onTestAll: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="bg-[--surface-container-lowest] rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden"
    >
      <div className="px-5 py-3 border-b border-[rgba(203,213,225,0.4)]">
        <SectionHeader title={title} testAllLoading={testAllLoading} onTestAll={onTestAll} />
      </div>
      <div className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Loading skeleton ──────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="h-[68px] rounded-xl border border-[rgba(203,213,225,0.4)] bg-[--surface-container-low] animate-pulse" />
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function ProvidersPage() {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [connections, setConnections] = useState<ProviderConnection[]>([]);
  const [nodes, setNodes] = useState<ProviderNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [testAllLoading, setTestAllLoading] = useState(false);
  const [search, setSearch] = useState("");

  // Compatible modals
  const [showOpenAICompat, setShowOpenAICompat] = useState(false);
  const [showAnthropicCompat, setShowAnthropicCompat] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [catRes, connRes, nodeRes] = await Promise.all([
        api.providers.catalog(),
        api.providers.list(),
        api.providers.nodes(),
      ]);
      setCatalog(catRes as CatalogResponse);
      setConnections(((connRes as { connections: ProviderConnection[] }).connections));
      setNodes(((nodeRes as { nodes: ProviderNode[] }).nodes));
    } catch (e) {
      console.error("Failed to load providers:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Compute stats per provider
  function getStats(providerId: string): ProviderStats {
    const conns = connections.filter(c => c.provider === providerId);
    const active = conns.filter(c => (c.isActive !== false) && (c.testStatus === "active" || c.testStatus === "success"));
    const error = conns.filter(c => (c.isActive !== false) && (c.testStatus === "error" || c.testStatus === "expired" || c.testStatus === "unavailable"));
    return { connected: active.length, error: error.length, total: conns.length };
  }

  // Toggle provider active state
  async function handleToggleProvider(providerId: string, active: boolean) {
    const conns = connections.filter(c => c.provider === providerId);
    await Promise.allSettled(
      conns.map(c => api.providers.update(c.id, { isActive: active }))
    );
    await fetchData();
  }

  // Test all connections (stub)
  async function handleTestAll() {
    setTestAllLoading(true);
    toast.info("Batch test not yet implemented");
    setTimeout(() => setTestAllLoading(false), 500);
  }

  // Toggle provider active state
  const compatibleNodes = nodes.filter(n =>
    isOpenAICompatible(n.id) || isAnthropicCompatible(n.id)
  );

  // OAuth/free providers (from free + freeTier)
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-16 skeleton rounded-xl animate-pulse" />
        <div className="grid grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-headline text-2xl sm:text-3xl font-bold tracking-tight text-[--on-surface]">
            Providers
          </h1>
          <p className="text-xs uppercase tracking-[0.12em] text-[--on-surface-variant] mt-1 font-medium">
            Manage your AI provider connections
          </p>
        </div>
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[--on-surface-variant]" />
          <Input
            placeholder="Search providers..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-9 w-52 pl-9 bg-[--surface-container-low] border border-[rgba(203,213,225,0.6)] rounded-lg text-sm"
          />
        </div>
      </div>

      {/* OAuth & Free Tier */}
      <ProviderSection title="OAuth Providers" testAllLoading={testAllLoading} onTestAll={handleTestAll}>
        {Object.entries(catalog?.free ?? {}).map(([id, meta]) => (
          <ProviderCard
            key={id}
            providerId={id}
            catalog={meta}
            stats={getStats(id)}
            authType="oauth"
            onToggle={(active) => handleToggleProvider(id, active)}
          />
        ))}
      </ProviderSection>

      {/* Free Tier */}
      <ProviderSection title="Free &amp; Free Tier Providers" testAllLoading={testAllLoading} onTestAll={handleTestAll}>
        {Object.entries(catalog?.freeTier ?? {}).map(([id, meta]) => (
          <ProviderCard
            key={id}
            providerId={id}
            catalog={meta}
            stats={getStats(id)}
            authType="free"
            onToggle={(active) => handleToggleProvider(id, active)}
          />
        ))}
      </ProviderSection>

      {/* API Key Providers */}
      <ProviderSection title="API Key Providers" testAllLoading={testAllLoading} onTestAll={handleTestAll}>
        {Object.entries(catalog?.apiKey ?? {}).map(([id, meta]) => (
          <ProviderCard
            key={id}
            providerId={id}
            catalog={meta}
            stats={getStats(id)}
            authType="apikey"
            onToggle={(active) => handleToggleProvider(id, active)}
          />
        ))}
      </ProviderSection>

      {/* API Key Compatible Providers */}
      <div className="bg-[--surface-container-lowest] rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[rgba(203,213,225,0.4)] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[--on-surface] tracking-wide">API Key Compatible Providers</h2>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 px-3 text-xs font-medium bg-[#0F172A] text-white hover:bg-[#1e293b]"
              onClick={() => setShowAnthropicCompat(true)}
            >
              <Plus className="w-3 h-3 mr-1" /> Add Anthropic Compatible
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-3 text-xs font-medium border-[rgba(203,213,225,0.6)] text-[--on-surface]"
              onClick={() => setShowOpenAICompat(true)}
            >
              <Plus className="w-3 h-3 mr-1" /> Add OpenAI Compatible
            </Button>
          </div>
        </div>

        <div className="p-4">
          {compatibleNodes.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-[rgba(203,213,225,0.4)] rounded-xl">
              <p className="text-sm text-[--on-surface-variant]">No compatible providers yet</p>
              <p className="text-xs text-[--on-surface-variant] mt-1">
                Use the buttons above to add OpenAI or Anthropic compatible endpoints
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {compatibleNodes.map(node => (
                <ProviderCard
                  key={node.id}
                  providerId={node.id}
                  node={node}
                  stats={getStats(node.id)}
                  authType="apikey"
                  onToggle={(active) => handleToggleProvider(node.id, active)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <AddOpenAICompatibleModal
        isOpen={showOpenAICompat}
        onClose={() => setShowOpenAICompat(false)}
        onCreated={async (node: ProviderNode) => {
          setShowOpenAICompat(false);
          await fetchData();
          navigate(`/providers/${encodeURIComponent(node.id)}`);
        }}
      />
      <AddAnthropicCompatibleModal
        isOpen={showAnthropicCompat}
        onClose={() => setShowAnthropicCompat(false)}
        onCreated={async (node: ProviderNode) => {
          setShowAnthropicCompat(false);
          await fetchData();
          navigate(`/providers/${encodeURIComponent(node.id)}`);
        }}
      />
    </div>
  );
}