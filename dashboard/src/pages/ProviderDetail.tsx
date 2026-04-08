import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { api, CatalogResponse, ProviderNode, ProviderConnection } from "@/lib/api";
import { useAuth } from "@/lib/auth.tsx";
import {
  isOpenAICompatibleProvider,
  isAnthropicCompatibleProvider,
  isOAuthProvider,
  getProviderConfig,
} from "@/constants/providers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, ChevronUp, ChevronDown, Pencil, Trash2, Copy, ArrowLeft, ExternalLink } from "lucide-react";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────────

interface ModelAlias {
  alias: string;
  fullModel: string;
}

// ─── Status helpers ──────────────────────────────────────────────────────────────

function statusVariant(conn: ProviderConnection): "success" | "error" | "default" {
  if (conn.isActive === false) return "default";
  if (conn.testStatus === "active" || conn.testStatus === "success") return "success";
  if (conn.testStatus === "error" || conn.testStatus === "expired" || conn.testStatus === "unavailable") return "error";
  return "default";
}

function statusLabel(conn: ProviderConnection): string {
  if (conn.isActive === false) return "disabled";
  return conn.testStatus ?? "unknown";
}

function statusColor(variant: string): string {
  if (variant === "success") return "text-green-600";
  if (variant === "error") return "text-red-500";
  return "text-[--on-surface-variant]";
}

// ─── Provider icon ──────────────────────────────────────────────────────────────

function ProviderIcon({ providerId, color, textIcon, size = 48 }: {
  providerId: string; color: string; textIcon: string; size?: number;
}) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-lg font-bold text-white shrink-0"
      style={{ backgroundColor: color, width: size, height: size, fontSize: size * 0.35 }}
    >
      {textIcon}
    </span>
  );
}

// ─── Connection Row ─────────────────────────────────────────────────────────────

function ConnectionRow({
  conn,
  isFirst,
  isLast,
  isAdmin,
  onMoveUp,
  onMoveDown,
  onToggle,
  onEdit,
  onDelete,
}: {
  conn: ProviderConnection;
  isFirst: boolean;
  isLast: boolean;
  isAdmin: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggle: (v: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const variant = statusVariant(conn);
  const label = statusLabel(conn);
  const color = statusColor(variant);
  const dotColor = variant === "success" ? "bg-green-500" : variant === "error" ? "bg-red-500" : "bg-gray-400";

  return (
    <div className={`flex items-center gap-3 px-4 py-3 hover:bg-[--surface-container-low]/50 transition-colors ${conn.isActive === false ? "opacity-60" : ""}`}>
      {/* Priority reorder */}
      <div className="flex flex-col shrink-0">
        <button
          onClick={onMoveUp}
          disabled={isFirst}
          className={`p-0.5 rounded ${isFirst ? "text-[--on-surface-variant]/30" : "text-[--on-surface-variant] hover:text-[--on-surface]"}`}
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onMoveDown}
          disabled={isLast}
          className={`p-0.5 rounded ${isLast ? "text-[--on-surface-variant]/30" : "text-[--on-surface-variant] hover:text-[--on-surface]"}`}
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Lock/key icon */}
      <span className="text-[--on-surface-variant] shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      </span>

      {/* Name + status */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[--on-surface] truncate">{conn.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`inline-flex items-center gap-1 text-xs font-medium ${color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
            {label}
          </span>
          {conn.lastError && (
            <span className="text-xs text-red-500 truncate max-w-[250px]" title={conn.lastError}>
              {conn.lastError}
            </span>
          )}
          <span className="text-xs text-[--on-surface-variant]">#{conn.priority}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onEdit}
          className="flex flex-col items-center px-2 py-1 rounded text-[--on-surface-variant] hover:text-[--on-surface] hover:bg-[--surface-container-low]"
          title="Edit"
        >
          <Pencil className="w-3.5 h-3.5" />
          <span className="text-[10px] leading-tight">Edit</span>
        </button>
        {isAdmin && (
          <button
            onClick={onDelete}
            className="flex flex-col items-center px-2 py-1 rounded text-red-500 hover:bg-red-50"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="text-[10px] leading-tight">Delete</span>
          </button>
        )}
        <Switch checked={conn.isActive !== false} onCheckedChange={onToggle} />
      </div>
    </div>
  );
}

// ─── Add API Key Modal ─────────────────────────────────────────────────────────

function AddApiKeyModal({ isOpen, providerId, providerName, onSave, onClose }: {
  isOpen: boolean;
  providerId: string;
  providerName: string;
  onSave: (data: { name: string; apiKey: string; priority: number }) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ name: "", apiKey: "", priority: 1 });
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<"success" | "failed" | null>(null);

  useEffect(() => {
    if (isOpen) setForm({ name: "", apiKey: "", priority: 1 });
    setCheckResult(null);
  }, [isOpen]);

  async function handleCheck() {
    if (!form.apiKey) return;
    setChecking(true);
    setCheckResult(null);
    // For now just do a basic presence check
    await new Promise((r) => setTimeout(r, 500));
    setCheckResult(form.apiKey.length > 5 ? "success" : "failed");
    setChecking(false);
  }

  function handleSave() {
    if (!form.name || !form.apiKey) return;
    onSave({ name: form.name, apiKey: form.apiKey, priority: form.priority });
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[--surface-container-lowest] rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)] max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline text-lg font-bold">
            Add {providerName} API Key
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]">Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Production Key"
              className="h-11 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]">API Key</Label>
            <div className="flex gap-2">
              <Input
                type="password"
                value={form.apiKey}
                onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value, checkResult: null }))}
                placeholder="sk-..."
                className="h-11 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-11 shrink-0 px-3"
                onClick={handleCheck}
                disabled={!form.apiKey || checking}
              >
                {checking ? "..." : "Check"}
              </Button>
            </div>
            {checkResult && (
              <p className={`text-xs font-medium ${checkResult === "success" ? "text-green-600" : "text-red-500"}`}>
                {checkResult === "success" ? "✓ Key looks valid" : "✗ Key looks invalid"}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]">Priority</Label>
            <Input
              type="number"
              min={1}
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: parseInt(e.target.value) || 1 }))}
              className="h-11 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="h-10 px-4 rounded font-medium text-sm">Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={!form.name || !form.apiKey}
            className="h-10 px-5 rounded font-semibold text-sm bg-[#0F172A] text-white hover:bg-[#1e293b]"
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Connection Modal ──────────────────────────────────────────────────────

function EditConnectionModal({ isOpen, connection, onSave, onClose }: {
  isOpen: boolean;
  connection: ProviderConnection | null;
  onSave: (id: string, data: { name: string; priority: number; apiKey?: string }) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ name: "", priority: 1, apiKey: "" });

  useEffect(() => {
    if (connection) {
      setForm({ name: connection.name ?? "", priority: connection.priority ?? 1, apiKey: "" });
    }
  }, [connection]);

  function handleSave() {
    if (!connection) return;
    onSave(connection.id, { name: form.name, priority: form.priority, apiKey: form.apiKey || undefined });
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[--surface-container-lowest] rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)] max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline text-lg font-bold">Edit Connection</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]">Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Production Key"
              className="h-11 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]">Priority</Label>
            <Input
              type="number"
              min={1}
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: parseInt(e.target.value) || 1 }))}
              className="h-11 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]">
              API Key <span className="font-normal normal-case tracking-normal text-[--on-surface-variant]">(leave blank to keep current)</span>
            </Label>
            <Input
              type="password"
              value={form.apiKey}
              onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
              placeholder="sk-..."
              className="h-11 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="h-10 px-4 rounded font-medium text-sm">Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={!form.name}
            className="h-10 px-5 rounded font-semibold text-sm bg-[#0F172A] text-white hover:bg-[#1e293b]"
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Custom Model Modal ────────────────────────────────────────────────────

function AddCustomModelModal({ isOpen, providerId, onAdd, onClose }: {
  isOpen: boolean;
  providerId: string;
  onAdd: (modelId: string) => void;
  onClose: () => void;
}) {
  const [modelId, setModelId] = useState("");

  useEffect(() => {
    if (isOpen) setModelId("");
  }, [isOpen]);

  function handleAdd() {
    if (!modelId.trim()) return;
    onAdd(modelId.trim());
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[--surface-container-lowest] rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)] max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline text-lg font-bold">Add Model</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]">Model ID</Label>
            <Input
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="e.g. gpt-4o"
              className="h-11 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm"
              autoFocus
            />
            <p className="text-xs text-[--on-surface-variant]">
              Sent to provider as: <code className="font-mono bg-[--surface-container-low] px-1 rounded">{modelId.trim() || "model-id"}</code>
            </p>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="h-10 px-4 rounded font-medium text-sm">Cancel</Button>
          <Button
            onClick={handleAdd}
            disabled={!modelId.trim()}
            className="h-10 px-5 rounded font-semibold text-sm bg-[#0F172A] text-white hover:bg-[#1e293b]"
          >
            Add Model
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Model Tile ─────────────────────────────────────────────────────────────────

function ModelTile({ modelId, alias, onCopy, copied }: {
  modelId: string;
  alias?: string;
  onCopy: (id: string) => void;
  copied: string | null;
}) {
  return (
    <div className="group flex items-center gap-2 px-3 py-2 rounded-lg border border-[rgba(203,213,225,0.4)] hover:bg-[--surface-container-low]/50 transition-colors">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[--on-surface-variant] shrink-0">
        <path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>
      </svg>
      <code className="text-xs font-mono text-[--on-surface] flex-1 truncate">{alias ?? modelId}</code>
      <button
        onClick={() => onCopy(alias ?? modelId)}
        className="shrink-0 text-[--on-surface-variant] hover:text-[--on-surface]"
        title="Copy"
      >
        {copied === (alias ?? modelId) ? (
          <span className="text-xs text-green-600">✓</span>
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function ProviderDetail() {
  const { providerId } = useParams<{ providerId: string }>();
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const decodedId = providerId ? decodeURIComponent(providerId) : "";

  const [connections, setConnections] = useState<ProviderConnection[]>([]);
  const [nodes, setNodes] = useState<ProviderNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [customModels, setCustomModels] = useState<string[]>([]);

  // Modals
  const [showAddApiKey, setShowAddApiKey] = useState(false);
  const [showEditConn, setShowEditConn] = useState(false);
  const [showAddModel, setShowAddModel] = useState(false);
  const [editingConn, setEditingConn] = useState<ProviderConnection | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Determine provider info
  const isCompatible = isOpenAICompatibleProvider(decodedId) || isAnthropicCompatibleProvider(decodedId);
  const isOAuth = isOAuthProvider(decodedId);

  const node = nodes.find((n) => n.id === decodedId);
  const providerMeta = !isCompatible ? getProviderConfig(decodedId) : null;

  const displayName = isCompatible
    ? node?.name ?? (isAnthropicCompatibleProvider(decodedId) ? "Anthropic Compatible" : "OpenAI Compatible")
    : providerMeta?.name ?? decodedId;

  const color = isCompatible
    ? (isAnthropicCompatibleProvider(decodedId) ? "#D97757" : "#10A37F")
    : providerMeta?.color ?? "#6B7280";

  const textIcon = isCompatible
    ? (isAnthropicCompatibleProvider(decodedId) ? "AC" : "OC")
    : providerMeta?.textIcon ?? "??";

  const noticeText = providerMeta?.notice?.text;
  const noticeUrl = providerMeta?.notice?.apiKeyUrl;

  const fetchData = useCallback(async () => {
    try {
      const [connRes, nodeRes, catRes] = await Promise.all([
        api.providers.list(),
        api.providers.nodes(),
        api.providers.catalog(),
      ]);
      const all = ((connRes as { connections: ProviderConnection[] }).connections).filter(
        (c) => c.provider === decodedId
      );
      setConnections(all);
      setNodes((nodeRes as { nodes: ProviderNode[] }).nodes);
      setCatalog(catRes as CatalogResponse);
    } catch (e) {
      console.error("Failed to load:", e);
    } finally {
      setLoading(false);
    }
  }, [decodedId]);

  // Load stored custom models from localStorage
  const loadCustomModels = useCallback(() => {
    try {
      const stored = localStorage.getItem(`models:${decodedId}`);
      if (stored) setCustomModels(JSON.parse(stored));
    } catch {}
  }, [decodedId]);

  useEffect(() => {
    fetchData();
    loadCustomModels();
  }, [fetchData, loadCustomModels]);

  // Copy helper
  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 1500);
  }

  // CRUD handlers
  async function handleAddApiKey(data: { name: string; apiKey: string; priority: number }) {
    await api.providers.create({
      provider: decodedId,
      name: data.name,
      apiKey: data.apiKey,
      priority: data.priority,
      authType: "apikey",
      isActive: true,
      testStatus: "unknown",
    });
    setShowAddApiKey(false);
    await fetchData();
    toast.success("Connection added");
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this connection?")) return;
    await api.providers.remove(id);
    await fetchData();
    toast.success("Connection deleted");
  }

  async function handleToggle(conn: ProviderConnection) {
    await api.providers.update(conn.id, { isActive: !(conn.isActive !== false) });
    await fetchData();
  }

  async function handleSwapPriority(i1: number, i2: number) {
    const reordered = [...connections];
    [reordered[i1], reordered[i2]] = [reordered[i2], reordered[i1]];
    setConnections(reordered);
    await Promise.allSettled([
      api.providers.update(reordered[i1].id, { priority: i1 }),
      api.providers.update(reordered[i2].id, { priority: i2 }),
    ]);
    await fetchData();
  }

  async function handleEditSave(id: string, data: { name: string; priority: number; apiKey?: string }) {
    const payload: Record<string, unknown> = { name: data.name, priority: data.priority };
    if (data.apiKey) payload.apiKey = data.apiKey;
    await api.providers.update(id, payload);
    setShowEditConn(false);
    setEditingConn(null);
    await fetchData();
    toast.success("Connection updated");
  }

  function handleAddModel(modelId: string) {
    const updated = [...customModels, modelId];
    setCustomModels(updated);
    localStorage.setItem(`models:${decodedId}`, JSON.stringify(updated));
    setShowAddModel(false);
    toast.success(`Model ${modelId} added`);
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-4 w-32 bg-[--surface-container-low] rounded" />
        <div className="h-24 bg-[--surface-container-low] rounded-xl" />
        <div className="h-64 bg-[--surface-container-low] rounded-xl" />
      </div>
    );
  }

  if (!catalog && !loading) {
    return (
      <div className="text-center py-20">
        <p className="text-[--on-surface-variant]">Provider not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        to="/providers"
        className="inline-flex items-center gap-1.5 text-sm text-[--on-surface-variant] hover:text-[--on-surface] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Providers
      </Link>

      {/* Provider header */}
      <div className="flex items-center gap-4">
        <ProviderIcon providerId={decodedId} color={color} textIcon={textIcon} />
        <div>
          <h1 className="font-headline text-2xl sm:text-3xl font-bold tracking-tight text-[--on-surface]">
            {displayName}
          </h1>
          <p className="text-sm text-[--on-surface-variant] mt-0.5">
            {connections.length} connection{connections.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Notice/info banner */}
      {noticeText && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[--surface-container-low] border border-[rgba(203,213,225,0.4)]">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[--on-surface-variant] shrink-0">
            <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
          </svg>
          <p className="text-xs text-[--on-surface-variant] flex-1 leading-relaxed">{noticeText}</p>
          {noticeUrl && (
            <a
              href={noticeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[--primary] hover:underline shrink-0 flex items-center gap-1"
            >
              Get API Key <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}

      {/* Connections card */}
      <div className="bg-[--surface-container-lowest] rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[rgba(203,213,225,0.4)] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[--on-surface]">Connections</h2>
          {!isOAuth && (
            <Button
              size="sm"
              className="h-8 px-3 text-xs font-semibold bg-[#0F172A] text-white hover:bg-[#1e293b]"
              onClick={() => setShowAddApiKey(true)}
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add
            </Button>
          )}
        </div>

        {connections.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[--surface-container-low] mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[--on-surface-variant]">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </div>
            <p className="text-sm font-medium text-[--on-surface] mb-1">No connections yet</p>
            <p className="text-xs text-[--on-surface-variant] mb-4">Add your first connection to get started</p>
            {!isOAuth && (
              <Button
                size="sm"
                className="h-8 px-3 text-xs font-semibold bg-[#0F172A] text-white hover:bg-[#1e293b]"
                onClick={() => setShowAddApiKey(true)}
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Add
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-[rgba(203,213,225,0.25)]">
            {connections.map((conn, i) => (
              <ConnectionRow
                key={conn.id}
                conn={conn}
                isFirst={i === 0}
                isLast={i === connections.length - 1}
                isAdmin={isAdmin}
                onMoveUp={() => handleSwapPriority(i, i - 1)}
                onMoveDown={() => handleSwapPriority(i, i + 1)}
                onToggle={(v) => {
                  if (v !== (conn.isActive !== false)) handleToggle(conn);
                }}
                onEdit={() => { setEditingConn(conn); setShowEditConn(true); }}
                onDelete={() => handleDelete(conn.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Available Models card */}
      <div className="bg-[--surface-container-lowest] rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[rgba(203,213,225,0.4)] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[--on-surface]">Available Models</h2>
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-3 text-xs font-medium border-[rgba(203,213,225,0.6)]"
            onClick={() => setShowAddModel(true)}
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Add Model
          </Button>
        </div>
        <div className="p-4">
          {customModels.length === 0 ? (
            <p className="text-xs text-[--on-surface-variant] text-center py-4">
              No models added yet. Click "Add Model" to add one.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {customModels.map((m) => (
                <ModelTile
                  key={m}
                  modelId={m}
                  onCopy={handleCopy}
                  copied={copied}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <AddApiKeyModal
        isOpen={showAddApiKey}
        providerId={decodedId}
        providerName={displayName}
        onSave={handleAddApiKey}
        onClose={() => setShowAddApiKey(false)}
      />
      <EditConnectionModal
        isOpen={showEditConn}
        connection={editingConn}
        onSave={handleEditSave}
        onClose={() => { setShowEditConn(false); setEditingConn(null); }}
      />
      <AddCustomModelModal
        isOpen={showAddModel}
        providerId={decodedId}
        onAdd={handleAddModel}
        onClose={() => setShowAddModel(false)}
      />
    </div>
  );
}
