import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import {
  api,
  CatalogResponse,
  ProviderNode,
  ProviderConnection,
} from "@/lib/api";
import { useAuth } from "@/lib/auth.tsx";
import {
  isOpenAICompatibleProvider,
  isAnthropicCompatibleProvider,
  isOAuthProvider,
  getProviderConfig,
  getProviderAlias,
} from "@/constants/providers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { ProviderIcon } from "@/components/ProviderIcon";
import {
  Plus,
  ChevronUp,
  ChevronDown,
  Pencil,
  Trash2,
  Copy,
  ArrowLeft,
  ExternalLink,
  Play,
  Loader2,
} from "lucide-react";
import OAuthModal from "@/components/OAuthModal";
import KiroAuthModal from "@/components/KiroAuthModal";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────────

interface ProviderModel {
  id: string;
  name?: string;
  type?: string;
}

interface ModelsResponse {
  provider: string;
  alias: string;
  models: ProviderModel[];
}

// ─── Status helpers ──────────────────────────────────────────────────────────────

function statusVariant(
  conn: ProviderConnection,
): "success" | "error" | "default" {
  if (conn.isActive === false) return "default";
  if (conn.testStatus === "active" || conn.testStatus === "success")
    return "success";
  if (
    conn.testStatus === "error" ||
    conn.testStatus === "expired" ||
    conn.testStatus === "unavailable"
  )
    return "error";
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

// ─── Helper to get logo path for a provider ───────────────────────────────────────

function getLogoPath(providerId: string, node?: ProviderNode): string {
  // Handle compatible providers
  if (node) {
    if (isAnthropicCompatibleProvider(node.type ?? "")) {
      return "/providers/anthropic-m.webp";
    }
    if (isOpenAICompatibleProvider(node.type ?? "")) {
      return node.apiType === "responses"
        ? "/providers/oai-r.webp"
        : "/providers/oai-cc.webp";
    }
  }
  return `/providers/${providerId}.webp`;
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
  onTest,
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
  onTest: (id: string) => void;
}) {
  const [testing, setTesting] = useState(false);
  const variant = statusVariant(conn);
  const label = statusLabel(conn);
  const color = statusColor(variant);
  const dotColor =
    variant === "success"
      ? "bg-green-500"
      : variant === "error"
        ? "bg-red-500"
        : "bg-gray-400";

  const handleTestClick = async () => {
    setTesting(true);
    try {
      onTest(conn.id);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 hover:bg-[--surface-container-low]/50 transition-colors ${conn.isActive === false ? "opacity-60" : ""}`}
    >
      {/* Priority reorder */}
      <div className='flex flex-col shrink-0'>
        <button
          onClick={onMoveUp}
          disabled={isFirst}
          className={`p-0.5 rounded ${isFirst ? "text-[--on-surface-variant]/30" : "text-[--on-surface-variant] hover:text-[--on-surface]"}`}
        >
          <ChevronUp className='w-3.5 h-3.5' />
        </button>
        <button
          onClick={onMoveDown}
          disabled={isLast}
          className={`p-0.5 rounded ${isLast ? "text-[--on-surface-variant]/30" : "text-[--on-surface-variant] hover:text-[--on-surface]"}`}
        >
          <ChevronDown className='w-3.5 h-3.5' />
        </button>
      </div>

      {/* Lock/key icon */}
      <span className='text-[--on-surface-variant] shrink-0'>
        <svg
          xmlns='http://www.w3.org/2000/svg'
          width='16'
          height='16'
          viewBox='0 0 24 24'
          fill='none'
          stroke='currentColor'
          strokeWidth='2'
          strokeLinecap='round'
          strokeLinejoin='round'
        >
          <rect width='18' height='11' x='3' y='11' rx='2' ry='2' />
          <path d='M7 11V7a5 5 0 0 1 10 0v4' />
        </svg>
      </span>

      {/* Name + status */}
      <div className='flex-1 min-w-0'>
        <p className='text-sm font-medium text-[--on-surface] truncate'>
          {conn.name}
        </p>
        <div className='flex items-center gap-2 mt-0.5'>
          <span
            className={`inline-flex items-center gap-1 text-xs font-medium ${color}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
            {label}
          </span>
          {conn.lastError && (
            <span
              className='text-xs text-red-500 truncate max-w-[250px]'
              title={conn.lastError}
            >
              {conn.lastError}
            </span>
          )}
          <span className='text-xs text-[--on-surface-variant]'>
            #{conn.priority}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className='flex items-center gap-1 shrink-0'>
        {/* Test button */}
        <button
          onClick={handleTestClick}
          disabled={testing}
          className='flex flex-col items-center px-2 py-1 rounded text-[--on-surface-variant] hover:text-[--on-surface] hover:bg-[--surface-container-low]'
          title='Test connection'
        >
          {testing ? (
            <Loader2 className='w-3.5 h-3.5 animate-spin' />
          ) : (
            <Play className='w-3.5 h-3.5' />
          )}
          <span className='text-[10px] leading-tight'>Test</span>
        </button>
        <button
          onClick={onEdit}
          className='flex flex-col items-center px-2 py-1 rounded text-[--on-surface-variant] hover:text-[--on-surface] hover:bg-[--surface-container-low]'
          title='Edit'
        >
          <Pencil className='w-3.5 h-3.5' />
          <span className='text-[10px] leading-tight'>Edit</span>
        </button>
        {isAdmin && (
          <button
            onClick={onDelete}
            className='flex flex-col items-center px-2 py-1 rounded text-red-500 hover:bg-red-50'
            title='Delete'
          >
            <Trash2 className='w-3.5 h-3.5' />
            <span className='text-[10px] leading-tight'>Delete</span>
          </button>
        )}
        <Switch checked={conn.isActive !== false} onCheckedChange={onToggle} />
      </div>
    </div>
  );
}

// ─── Add API Key Modal ─────────────────────────────────────────────────────────

function AddApiKeyModal({
  isOpen,
  providerId: _providerId,
  providerName,
  onSave,
  onClose,
}: {
  isOpen: boolean;
  providerId: string;
  providerName: string;
  onSave: (data: { name: string; apiKey: string; priority: number }) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ name: "", apiKey: "", priority: 1 });
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<"success" | "failed" | null>(
    null,
  );

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
      <DialogContent className='bg-[--surface-container-lowest] rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)] max-w-md'>
        <DialogHeader>
          <DialogTitle className='font-headline text-lg font-bold'>
            Add {providerName} API Key
          </DialogTitle>
        </DialogHeader>

        <div className='space-y-4 py-2'>
          <div className='space-y-1.5'>
            <Label className='text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]'>
              Name
            </Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder='Production Key'
              className='h-11 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm'
            />
          </div>

          <div className='space-y-1.5'>
            <Label className='text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]'>
              API Key
            </Label>
            <div className='flex gap-2'>
              <Input
                type='password'
                value={form.apiKey}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    apiKey: e.target.value,
                    checkResult: null,
                  }))
                }
                placeholder='sk-...'
                className='h-11 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm flex-1'
              />
              <Button
                variant='outline'
                size='sm'
                className='h-11 shrink-0 px-3'
                onClick={handleCheck}
                disabled={!form.apiKey || checking}
              >
                {checking ? "..." : "Check"}
              </Button>
            </div>
            {checkResult && (
              <p
                className={`text-xs font-medium ${checkResult === "success" ? "text-green-600" : "text-red-500"}`}
              >
                {checkResult === "success"
                  ? "✓ Key looks valid"
                  : "✗ Key looks invalid"}
              </p>
            )}
          </div>

          <div className='space-y-1.5'>
            <Label className='text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]'>
              Priority
            </Label>
            <Input
              type='number'
              min={1}
              value={form.priority}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  priority: parseInt(e.target.value) || 1,
                }))
              }
              className='h-11 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm'
            />
          </div>
        </div>

        <DialogFooter className='gap-2'>
          <Button
            variant='outline'
            onClick={onClose}
            className='h-10 px-4 rounded font-medium text-sm'
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!form.name || !form.apiKey}
            className='h-10 px-5 rounded font-semibold text-sm bg-[#0F172A] text-white hover:bg-[#1e293b]'
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Connection Modal ──────────────────────────────────────────────────────

function EditConnectionModal({
  isOpen,
  connection,
  isOAuth,
  onSave,
  onClose,
}: {
  isOpen: boolean;
  connection: ProviderConnection | null;
  isOAuth?: boolean;
  onSave: (
    id: string,
    data: {
      name: string;
      priority: number;
      refreshToken?: string;
      apiKey?: string;
    },
  ) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ name: "", priority: 1, apiKey: "" });

  useEffect(() => {
    if (connection) {
      setForm({
        name: connection.name ?? "",
        priority: connection.priority ?? 1,
        apiKey: "",
      });
    }
  }, [connection]);

  function handleSave() {
    if (!connection) return;
    const payload: {
      name: string;
      priority: number;
      refreshToken?: string;
      apiKey?: string;
    } = {
      name: form.name,
      priority: form.priority,
    };
    if (form.apiKey) {
      if (isOAuth) {
        payload.refreshToken = form.apiKey;
      } else {
        payload.apiKey = form.apiKey;
      }
    }
    onSave(connection.id, payload);
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className='bg-[--surface-container-lowest] rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)] max-w-md'>
        <DialogHeader>
          <DialogTitle className='font-headline text-lg font-bold'>
            Edit Connection
          </DialogTitle>
        </DialogHeader>

        <div className='space-y-4 py-2'>
          <div className='space-y-1.5'>
            <Label className='text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]'>
              Name
            </Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder='Production Key'
              className='h-11 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm'
            />
          </div>
          <div className='space-y-1.5'>
            <Label className='text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]'>
              Priority
            </Label>
            <Input
              type='number'
              min={1}
              value={form.priority}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  priority: parseInt(e.target.value) || 1,
                }))
              }
              className='h-11 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm'
            />
          </div>
          <div className='space-y-1.5'>
            <Label className='text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]'>
              {isOAuth ? "Refresh Token" : "API Key"}{" "}
              <span className='font-normal normal-case tracking-normal text-[--on-surface-variant]'>
                (leave blank to keep current)
              </span>
            </Label>
            <Input
              type='password'
              value={form.apiKey}
              onChange={(e) =>
                setForm((f) => ({ ...f, apiKey: e.target.value }))
              }
              placeholder={isOAuth ? "Enter refresh token..." : "sk-..."}
              className='h-11 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm'
            />
          </div>
        </div>

        <DialogFooter className='gap-2'>
          <Button
            variant='outline'
            onClick={onClose}
            className='h-10 px-4 rounded font-medium text-sm'
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!form.name}
            className='h-10 px-5 rounded font-semibold text-sm bg-[#0F172A] text-white hover:bg-[#1e293b]'
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Custom Model Modal ────────────────────────────────────────────────────

function AddCustomModelModal({
  isOpen,
  providerId: _providerId,
  onAdd,
  onClose,
}: {
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
      <DialogContent className='bg-[--surface-container-lowest] rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)] max-w-md'>
        <DialogHeader>
          <DialogTitle className='font-headline text-lg font-bold'>
            Add Model
          </DialogTitle>
        </DialogHeader>
        <div className='space-y-4 py-2'>
          <div className='space-y-1.5'>
            <Label className='text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]'>
              Model ID
            </Label>
            <Input
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder='e.g. gpt-4o'
              className='h-11 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm'
              autoFocus
            />
            <p className='text-xs text-[--on-surface-variant]'>
              Sent to provider as:{" "}
              <code className='font-mono bg-[--surface-container-low] px-1 rounded'>
                {modelId.trim() || "model-id"}
              </code>
            </p>
          </div>
        </div>
        <DialogFooter className='gap-2'>
          <Button
            variant='outline'
            onClick={onClose}
            className='h-10 px-4 rounded font-medium text-sm'
          >
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            disabled={!modelId.trim()}
            className='h-10 px-5 rounded font-semibold text-sm bg-[#0F172A] text-white hover:bg-[#1e293b]'
          >
            Add Model
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Model Tile ─────────────────────────────────────────────────────────────────

type TestStatus = "ok" | "error" | null;

function ModelTile({
  modelId,
  alias,
  onCopy,
  copied,
  onTest,
  isTesting,
  testStatus,
  onDelete,
}: {
  modelId: string;
  alias?: string;
  onCopy: (id: string) => void;
  copied: string | null;
  onTest?: () => void;
  isTesting?: boolean;
  testStatus?: TestStatus;
  onDelete?: () => void;
}) {
  const borderColor =
    testStatus === "ok"
      ? "border-green-500/40"
      : testStatus === "error"
        ? "border-red-500/40"
        : "border-[rgba(203,213,225,0.4)]";

  const iconColor =
    testStatus === "ok"
      ? "text-green-600"
      : testStatus === "error"
        ? "text-red-500"
        : "text-[--on-surface-variant]";

  return (
    <div
      className={`group flex items-center gap-2 px-3 py-2 rounded-lg border ${borderColor} hover:bg-[--surface-container-low]/50 transition-colors`}
    >
      <svg
        xmlns='http://www.w3.org/2000/svg'
        width='16'
        height='16'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='2'
        strokeLinecap='round'
        strokeLinejoin='round'
        className={`shrink-0 ${iconColor}`}
      >
        <path d='M12 8V4H8' />
        <rect width='16' height='12' x='4' y='8' rx='2' />
        <path d='M2 14h2' />
        <path d='M20 14h2' />
        <path d='M15 13v2' />
        <path d='M9 13v2' />
      </svg>
      <code className='text-xs font-mono text-[--on-surface] flex-1 truncate'>
        {alias ?? modelId}
      </code>
      {onTest && (
        <button
          onClick={onTest}
          disabled={isTesting}
          className='shrink-0 text-[--on-surface-variant] hover:text-[--on-surface] disabled:opacity-50'
          title={isTesting ? "Testing..." : "Test model"}
        >
          {isTesting ? (
            <Loader2 className='w-3.5 h-3.5 animate-spin' />
          ) : testStatus === "ok" ? (
            <span className='text-xs text-green-600'>✓</span>
          ) : testStatus === "error" ? (
            <span className='text-xs text-red-500'>✗</span>
          ) : (
            <Play className='w-3.5 h-3.5' />
          )}
        </button>
      )}
      {onDelete && (
        <button
          onClick={onDelete}
          className='shrink-0 text-[--on-surface-variant] hover:text-red-500'
          title='Delete model'
        >
          <Trash2 className='w-3.5 h-3.5' />
        </button>
      )}
      <button
        onClick={() => onCopy(alias ?? modelId)}
        className='shrink-0 text-[--on-surface-variant] hover:text-[--on-surface]'
        title='Copy'
      >
        {copied === (alias ?? modelId) ? (
          <span className='text-xs text-green-600'>✓</span>
        ) : (
          <Copy className='w-3.5 h-3.5' />
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
  const [predefinedModels, setPredefinedModels] = useState<ProviderModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);

  // Modals
  const [showAddApiKey, setShowAddApiKey] = useState(false);
  const [showEditConn, setShowEditConn] = useState(false);
  const [showAddModel, setShowAddModel] = useState(false);
  const [showOAuth, setShowOAuth] = useState(false);
  const [oauthMeta, setOauthMeta] = useState<Record<string, unknown>>({});
  const [showKiroAuth, setShowKiroAuth] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingConn, setDeletingConn] = useState<ProviderConnection | null>(
    null,
  );
  const [editingConn, setEditingConn] = useState<ProviderConnection | null>(
    null,
  );
  const [copied, setCopied] = useState<string | null>(null);
  const [testingAll, setTestingAll] = useState(false);
  const [testingModelId, setTestingModelId] = useState<string | null>(null);
  const [modelTestResults, setModelTestResults] = useState<
    Record<string, TestStatus>
  >({});
  const [fetchingModels, setFetchingModels] = useState(false);

  // Determine provider info
  const isCompatible =
    isOpenAICompatibleProvider(decodedId) ||
    isAnthropicCompatibleProvider(decodedId);
  const isOAuth = isOAuthProvider(decodedId);

  const node = nodes.find((n) => n.id === decodedId);
  const providerMeta = !isCompatible ? getProviderConfig(decodedId) : null;

  const displayName = isCompatible
    ? (node?.name ??
      (isAnthropicCompatibleProvider(decodedId)
        ? "Anthropic Compatible"
        : "OpenAI Compatible"))
    : (providerMeta?.name ?? decodedId);

  const color = isCompatible
    ? isAnthropicCompatibleProvider(decodedId)
      ? "#D97757"
      : "#10A37F"
    : (providerMeta?.color ?? "#6B7280");

  const textIcon = isCompatible
    ? isAnthropicCompatibleProvider(decodedId)
      ? "AC"
      : "OC"
    : (providerMeta?.textIcon ?? "??");

  const noticeText = providerMeta?.notice?.text;
  const noticeUrl = providerMeta?.notice?.apiKeyUrl;

  const fetchData = useCallback(async () => {
    try {
      const [connRes, nodeRes, catRes] = await Promise.all([
        api.providers.list(),
        api.providers.nodes(),
        api.providers.catalog(),
      ]);
      const all = (
        connRes as { connections: ProviderConnection[] }
      ).connections.filter((c) => c.provider === decodedId);
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

  // Fetch predefined models from API
  const fetchPredefinedModels = useCallback(async () => {
    setLoadingModels(true);
    try {
      const response = await api.providers.getModels(decodedId);
      setPredefinedModels(response.models);
    } catch (e) {
      console.error("Failed to fetch predefined models:", e);
      setPredefinedModels([]);
    } finally {
      setLoadingModels(false);
    }
  }, [decodedId]);

  useEffect(() => {
    fetchData();
    loadCustomModels();
    fetchPredefinedModels();
  }, [fetchData, loadCustomModels, fetchPredefinedModels]);

  // Copy helper
  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 1500);
  }

  // CRUD handlers
  async function handleAddApiKey(data: {
    name: string;
    apiKey: string;
    priority: number;
  }) {
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

  async function handleOAuthSuccess() {
    setShowOAuth(false);
    await fetchData();
    toast.success("OAuth connection added");
  }

  async function handleKiroAuthMethod(
    method: string,
    config?: Record<string, unknown>,
  ) {
    setShowKiroAuth(false);

    if (method === "builder-id") {
      setShowOAuth(true);
    } else if (method === "idc") {
      setOauthMeta(config || {});
      setShowOAuth(true);
    } else if (method === "import") {
      // Import is handled by KiroAuthModal itself
      await fetchData();
      toast.success("Kiro connection imported");
    } else if (method === "google" || method === "github") {
      toast.info(
        `${method === "google" ? "Google" : "GitHub"} social login — coming soon!`,
      );
    }
  }

  async function handleDeleteConfirm(connection: ProviderConnection) {
    setDeletingConn(connection);
    setShowDeleteConfirm(true);
  }

  async function executeDelete() {
    if (!deletingConn) return;
    await api.providers.remove(deletingConn.id);
    setShowDeleteConfirm(false);
    setDeletingConn(null);
    await fetchData();
    toast.success("Connection deleted");
  }

  async function handleToggle(conn: ProviderConnection) {
    await api.providers.update(conn.id, {
      isActive: !(conn.isActive !== false),
    });
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

  async function handleEditSave(
    id: string,
    data: {
      name: string;
      priority: number;
      refreshToken?: string;
      apiKey?: string;
    },
  ) {
    const payload: Record<string, unknown> = {
      name: data.name,
      priority: data.priority,
    };
    if (data.apiKey) payload.apiKey = data.apiKey;
    if (data.refreshToken) payload.refreshToken = data.refreshToken;
    await api.providers.update(id, payload);
    setShowEditConn(false);
    setEditingConn(null);
    await fetchData();
    toast.success("Connection updated");
  }

  async function handleTestConnection(id: string) {
    try {
      const result = await api.providers.test(id);
      if (result.valid) {
        toast.success(`Connection tested successfully (${result.latencyMs}ms)`);
      } else {
        toast.error(`Test failed: ${result.error || "Unknown error"}`);
      }
      await fetchData();
    } catch (err) {
      toast.error(
        `Test failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  }

  async function handleTestAllConnections() {
    setTestingAll(true);
    const results = [];
    let passed = 0;
    let failed = 0;

    for (const conn of connections) {
      try {
        const result = await api.providers.test(conn.id);
        results.push({
          id: conn.id,
          valid: result.valid,
          latencyMs: result.latencyMs,
        });
        if (result.valid) {
          passed++;
        } else {
          failed++;
        }
      } catch (err) {
        results.push({ id: conn.id, valid: false, latencyMs: 0 });
        failed++;
      }
    }

    await fetchData();
    setTestingAll(false);

    if (failed === 0) {
      toast.success(
        `All ${connections.length} connections tested successfully`,
      );
    } else {
      toast.warning(`${passed}/${connections.length} passed, ${failed} failed`);
    }
  }

  async function handleTestModel(modelId: string) {
    if (testingModelId) return;
    setTestingModelId(modelId);
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

      // Construct full model path with provider alias (e.g., "nvidia/glm-5")
      // Only add prefix if modelId doesn't already start with it
      const providerAlias = getProviderAlias(decodedId);
      const fullModel = modelId.startsWith(`${providerAlias}/`)
        ? modelId
        : `${providerAlias}/${modelId}`;

      const start = Date.now();
      const res = await fetch(`${window.location.origin}/v1/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: fullModel,
          max_tokens: 1,
          stream: false,
          messages: [{ role: "user", content: "hi" }],
        }),
        signal: AbortSignal.timeout(15000),
      });
      const latencyMs = Date.now() - start;

      // Handle both streaming (SSE) and non-streaming (JSON) responses
      // For STREAM_PROVIDERS (openai, codex), backend always streams regardless of stream:false
      const contentType = res.headers.get("content-type") ?? "";
      const isStreaming = contentType.includes("text/event-stream");

      let success = false;
      let errorMsg = "";

      if (!res.ok) {
        // Try to parse error from response
        try {
          const errData = await res.json();
          errorMsg = errData?.error?.message ?? `HTTP ${res.status}`;
        } catch {
          errorMsg = `HTTP ${res.status}`;
        }
      } else if (isStreaming) {
        // Parse SSE stream - look for any valid chunk with content
        try {
          const reader = res.body?.getReader();
          if (reader) {
            const decoder = new TextDecoder();
            let foundContent = false;
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const text = decoder.decode(value);
              // Check for error in SSE
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
              // Check for valid content chunk
              if (
                text.includes('"choices"') &&
                (text.includes('"content"') || text.includes('"delta"'))
              ) {
                foundContent = true;
              }
              // Check for [DONE] marker
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
        // Non-streaming JSON response
        const data = await res.json().catch(() => null);
        if (data?.error) {
          errorMsg = data.error.message ?? "Unknown error";
        } else if (data?.choices?.length) {
          success = true;
        } else {
          errorMsg = "No choices in response";
        }
      }

      if (!success) {
        setModelTestResults((prev) => ({ ...prev, [modelId]: "error" }));
        toast.error(
          `Model ${modelId} test failed${errorMsg ? `: ${errorMsg}` : ""}`,
        );
      } else {
        setModelTestResults((prev) => ({ ...prev, [modelId]: "ok" }));
        toast.success(`Model ${modelId} tested successfully (${latencyMs}ms)`);
      }
    } catch (err) {
      setModelTestResults((prev) => ({ ...prev, [modelId]: "error" }));
      toast.error(
        `Model ${modelId} test failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setTestingModelId(null);
    }
  }

  function handleAddModel(modelId: string) {
    const updated = [...customModels, modelId];
    setCustomModels(updated);
    localStorage.setItem(`models:${decodedId}`, JSON.stringify(updated));
    setShowAddModel(false);
    toast.success(`Model ${modelId} added`);
  }

  function handleDeleteCustomModel(modelId: string) {
    const updated = customModels.filter((m) => m !== modelId);
    setCustomModels(updated);
    localStorage.setItem(`models:${decodedId}`, JSON.stringify(updated));
    toast.success(`Model ${modelId} deleted`);
  }

  async function handleFetchModels() {
    if (fetchingModels) return;
    setFetchingModels(true);
    try {
      const result = await api.providers.fetchModels(decodedId);
      const fetched = result.models.map(m => ({
        id: m.id,
        name: m.name,
      }));
      setPredefinedModels(fetched);
      toast.success(`Fetched ${result.count} models`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to fetch models");
    } finally {
      setFetchingModels(false);
    }
  }

  async function handleDeleteAllPredefinedModels() {
    if (predefinedModels.length === 0) return;
    try {
      setPredefinedModels([]);
      const activeConn = connections.find(c => c.isActive !== false);
      if (activeConn) {
        const psd = (activeConn.providerSpecificData as Record<string, unknown> | undefined) ?? {};
        await api.providers.update(activeConn.id, {
          providerSpecificData: { ...psd, enabledModels: [] },
        });
      }
      toast.success(`All models removed`);
    } catch (e) {
      toast.error("Failed to remove models");
      fetchPredefinedModels();
    }
  }

  async function handleDeletePredefinedModel(modelId: string) {
    try {
      // Remove from local state immediately
      setPredefinedModels(prev => prev.filter(m => m.id !== modelId));

      // Update enabledModels in DB: remove the model ID (strip prefix if present)
      const activeConn = connections.find(c => c.isActive !== false);
      if (activeConn) {
        const psd = (activeConn.providerSpecificData as Record<string, unknown> | undefined) ?? {};
        const enabledModels = (psd.enabledModels as string[]) ?? [];
        // modelId may be like "mvo/gpt-4o" — strip prefix to get raw ID
        const prefix = (psd.prefix as string | undefined) ?? decodedId;
        const rawId = modelId.startsWith(`${prefix}/`) ? modelId.slice(prefix.length + 1) : modelId;
        const updated = enabledModels.filter(m => m !== rawId);
        await api.providers.update(activeConn.id, {
          providerSpecificData: { ...psd, enabledModels: updated },
        });
      }
      toast.success(`Model removed`);
    } catch (e) {
      toast.error("Failed to remove model");
      // Re-fetch to restore state on error
      fetchPredefinedModels();
    }
  }

  if (loading) {
    return (
      <div className='space-y-6 animate-pulse'>
        <div className='h-4 w-32 bg-[--surface-container-low] rounded' />
        <div className='h-24 bg-[--surface-container-low] rounded-xl' />
        <div className='h-64 bg-[--surface-container-low] rounded-xl' />
      </div>
    );
  }

  if (!catalog && !loading) {
    return (
      <div className='text-center py-20'>
        <p className='text-[--on-surface-variant]'>Provider not found</p>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Back link */}
      <Link
        to='/providers'
        className='inline-flex items-center gap-1.5 text-sm text-[--on-surface-variant] hover:text-[--on-surface] transition-colors'
      >
        <ArrowLeft className='w-4 h-4' />
        Back to Providers
      </Link>

      {/* Provider header */}
      <div className='flex items-center gap-4'>
        <ProviderIcon
          src={getLogoPath(decodedId, node)}
          alt={displayName}
          size={48}
          className='rounded-lg'
          fallbackText={textIcon}
          fallbackColor={color}
        />
        <div>
          <h1 className='font-headline text-2xl sm:text-3xl font-bold tracking-tight text-[--on-surface]'>
            {displayName}
          </h1>
          <p className='text-sm text-[--on-surface-variant] mt-0.5'>
            {connections.length} connection{connections.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Notice/info banner */}
      {noticeText && (
        <div className='flex items-center gap-2 px-4 py-3 rounded-xl bg-[--surface-container-low] border border-[rgba(203,213,225,0.4)]'>
          <svg
            xmlns='http://www.w3.org/2000/svg'
            width='16'
            height='16'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='2'
            strokeLinecap='round'
            strokeLinejoin='round'
            className='text-[--on-surface-variant] shrink-0'
          >
            <circle cx='12' cy='12' r='10' />
            <path d='M12 16v-4' />
            <path d='M12 8h.01' />
          </svg>
          <p className='text-xs text-[--on-surface-variant] flex-1 leading-relaxed'>
            {noticeText}
          </p>
          {noticeUrl && (
            <a
              href={noticeUrl}
              target='_blank'
              rel='noopener noreferrer'
              className='text-xs text-[--primary] hover:underline shrink-0 flex items-center gap-1'
            >
              Get API Key <ExternalLink className='w-3 h-3' />
            </a>
          )}
        </div>
      )}

      {/* Connections card */}
      <div className='bg-[--surface-container-lowest] rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden'>
        <div className='px-5 py-4 border-b border-[rgba(203,213,225,0.4)] flex items-center justify-between'>
          <h2 className='text-sm font-semibold text-[--on-surface]'>
            Connections
          </h2>
          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              size='sm'
              className='h-8 px-3 text-xs font-medium border-[rgba(203,213,225,0.6)] text-[--on-surface-variant] hover:text-[--on-surface]'
              onClick={handleTestAllConnections}
              disabled={testingAll}
            >
              {testingAll ? "Testing..." : "Test All"}
            </Button>
            {isOAuth ? (
              <Button
                size='sm'
                className='h-8 px-3 text-xs font-semibold bg-[#0F172A] text-white hover:bg-[#1e293b]'
                onClick={() =>
                  decodedId === "kiro"
                    ? setShowKiroAuth(true)
                    : setShowOAuth(true)
                }
              >
                <Plus className='w-3.5 h-3.5 mr-1' />{" "}
                {decodedId === "kiro" ? "Add" : "Connect"}
              </Button>
            ) : (
              <Button
                size='sm'
                className='h-8 px-3 text-xs font-semibold bg-[#0F172A] text-white hover:bg-[#1e293b]'
                onClick={() => setShowAddApiKey(true)}
              >
                <Plus className='w-3.5 h-3.5 mr-1' /> Add
              </Button>
            )}
          </div>
        </div>

        {connections.length === 0 ? (
          <div className='text-center py-12'>
            <div className='inline-flex items-center justify-center w-12 h-12 rounded-full bg-[--surface-container-low] mb-3'>
              <svg
                xmlns='http://www.w3.org/2000/svg'
                width='24'
                height='24'
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='2'
                strokeLinecap='round'
                strokeLinejoin='round'
                className='text-[--on-surface-variant]'
              >
                <path d='M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z' />
                <circle cx='12' cy='12' r='3' />
              </svg>
            </div>
            <p className='text-sm font-medium text-[--on-surface] mb-1'>
              No connections yet
            </p>
            <p className='text-xs text-[--on-surface-variant] mb-4'>
              Add your first connection to get started
            </p>
            {isOAuth ? (
              <Button
                size='sm'
                className='h-8 px-3 text-xs font-semibold bg-[#0F172A] text-white hover:bg-[#1e293b]'
                onClick={() =>
                  decodedId === "kiro"
                    ? setShowKiroAuth(true)
                    : setShowOAuth(true)
                }
              >
                <Plus className='w-3.5 h-3.5 mr-1' />{" "}
                {decodedId === "kiro" ? "Add" : "Connect"}
              </Button>
            ) : (
              <Button
                size='sm'
                className='h-8 px-3 text-xs font-semibold bg-[#0F172A] text-white hover:bg-[#1e293b]'
                onClick={() => setShowAddApiKey(true)}
              >
                <Plus className='w-3.5 h-3.5 mr-1' /> Add
              </Button>
            )}
          </div>
        ) : (
          <div className='divide-y divide-[rgba(203,213,225,0.25)]'>
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
                onEdit={() => {
                  setEditingConn(conn);
                  setShowEditConn(true);
                }}
                onDelete={() => handleDeleteConfirm(conn)}
                onTest={handleTestConnection}
              />
            ))}
          </div>
        )}
      </div>

      {/* Available Models card */}
      <div className='bg-[--surface-container-lowest] rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden'>
        <div className='px-5 py-4 border-b border-[rgba(203,213,225,0.4)] flex items-center justify-between'>
          <h2 className='text-sm font-semibold text-[--on-surface]'>
            Available Models
            {!loadingModels && (
              <span className='ml-2 text-xs font-normal text-[--on-surface-variant]'>
                ({predefinedModels.length + customModels.length})
              </span>
            )}
          </h2>
          <div className='flex items-center gap-2'>
            <Button
              size='sm'
              variant='outline'
              className='h-8 px-3 text-xs font-medium border-[rgba(203,213,225,0.6)]'
              onClick={handleFetchModels}
              disabled={fetchingModels}
            >
              {fetchingModels ? (
                <Loader2 className='w-3.5 h-3.5 mr-1 animate-spin' />
              ) : (
                <Play className='w-3.5 h-3.5 mr-1' />
              )}
              Fetch Models
            </Button>
            <Button
              size='sm'
              variant='outline'
              className='h-8 px-3 text-xs font-medium border-[rgba(203,213,225,0.6)]'
              onClick={() => setShowAddModel(true)}
            >
              <Plus className='w-3.5 h-3.5 mr-1' /> Add Model
            </Button>
          </div>
        </div>
        <div className='p-4'>
          {loadingModels ? (
            <div className='flex flex-wrap gap-2'>
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className='h-9 w-32 rounded-lg bg-[--surface-container-low] animate-pulse'
                />
              ))}
            </div>
          ) : predefinedModels.length === 0 && customModels.length === 0 ? (
            <p className='text-xs text-[--on-surface-variant] text-center py-4'>
              No models available for this provider. Click "Add Model" to add a
              custom model.
            </p>
          ) : (
            <div className='space-y-3'>
              {/* Predefined models */}
              {predefinedModels.length > 0 && (
                <div>
                  <div className='flex items-center justify-between mb-2'>
                    <p className='text-xs font-medium text-[--on-surface-variant]'>
                      Predefined Models
                    </p>
                    {predefinedModels.length > 0 && (
                      <button
                        onClick={handleDeleteAllPredefinedModels}
                        className='text-xs text-[--error] hover:underline cursor-pointer'
                      >
                        Delete All
                      </button>
                    )}
                  </div>
                  <div className='flex flex-wrap gap-2'>
                    {predefinedModels.map((m) => (
                      <ModelTile
                        key={m.id}
                        modelId={m.name ?? m.id}
                        alias={m.id}
                        onCopy={handleCopy}
                        copied={copied}
                        onTest={
                          connections.length > 0
                            ? () => handleTestModel(m.id)
                            : undefined
                        }
                        isTesting={testingModelId === m.id}
                        testStatus={modelTestResults[m.id]}
                        onDelete={() => handleDeletePredefinedModel(m.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
              {/* Custom models */}
              {customModels.length > 0 && (
                <div>
                  <p className='text-xs font-medium text-[--on-surface-variant] mb-2'>
                    Custom Models
                  </p>
                  <div className='flex flex-wrap gap-2'>
                    {customModels.map((m) => {
                      const providerAlias = getProviderAlias(decodedId);
                      const alias = m.startsWith(`${providerAlias}/`)
                        ? m
                        : `${providerAlias}/${m}`;
                      return (
                        <ModelTile
                          key={m}
                          modelId={m}
                          alias={alias}
                          onCopy={handleCopy}
                          copied={copied}
                          onTest={
                            connections.length > 0
                              ? () => handleTestModel(m)
                              : undefined
                          }
                          isTesting={testingModelId === m}
                          testStatus={modelTestResults[m]}
                          onDelete={() => handleDeleteCustomModel(m)}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
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
        isOAuth={editingConn?.authType === "oauth"}
        onSave={handleEditSave}
        onClose={() => {
          setShowEditConn(false);
          setEditingConn(null);
        }}
      />
      <AddCustomModelModal
        isOpen={showAddModel}
        providerId={decodedId}
        onAdd={handleAddModel}
        onClose={() => setShowAddModel(false)}
      />
      <OAuthModal
        isOpen={showOAuth}
        provider={decodedId}
        providerName={displayName}
        oauthMeta={oauthMeta}
        onSuccess={handleOAuthSuccess}
        onClose={() => {
          setShowOAuth(false);
          setOauthMeta({});
        }}
      />
      <KiroAuthModal
        isOpen={showKiroAuth}
        onConnect={handleKiroAuthMethod}
        onClose={() => setShowKiroAuth(false)}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className='bg-[--surface-container-lowest] rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)] max-w-md'>
          <DialogHeader>
            <DialogTitle className='font-headline text-lg font-bold'>
              Delete Connection
            </DialogTitle>
            <DialogDescription className='text-sm text-[--on-surface-variant]'>
              Are you sure you want to delete{" "}
              <span className='font-medium text-[--on-surface]'>
                "{deletingConn?.name || "this connection"}"
              </span>
              ? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className='gap-2'>
            <Button
              variant='outline'
              onClick={() => setShowDeleteConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={executeDelete}
              className='bg-red-600 text-white hover:bg-red-700'
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
