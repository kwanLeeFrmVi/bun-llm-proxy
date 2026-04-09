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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { ProviderIcon } from "@/components/ProviderIcon";
import { Plus, ArrowLeft, ExternalLink, Play, Loader2 } from "lucide-react";
import OAuthModal from "@/components/OAuthModal";
import KiroAuthModal from "@/components/KiroAuthModal";
import { toast } from "sonner";

import { ConnectionRow } from "./ConnectionRow";
import { AddApiKeyModal } from "./AddApiKeyModal";
import { EditConnectionModal } from "./EditConnectionModal";
import { AddCustomModelModal } from "./AddCustomModelModal";
import { ModelTile } from "./ModelTile";
import { getLogoPath } from "./utils";
import type { ProviderModel, TestStatus } from "./types";
import { EditProviderModal } from "@/components/EditProviderModal";

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
  const [showEditProvider, setShowEditProvider] = useState(false);
  const [editingNode, setEditingNode] = useState<ProviderNode | null>(null);
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
        `${method === "google" ? "Google" : "GitHub"} social login coming soon!`,
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
      // For compatible providers, use node prefix instead of provider alias
      const providerPrefix = isCompatible ? (node?.prefix ?? decodedId) : getProviderAlias(decodedId);
      const fullModel = modelId.startsWith(`${providerPrefix}/`)
        ? modelId
        : `${providerPrefix}/${modelId}`;

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
        // modelId may be like "mvo/gpt-4o" strip prefix to get raw ID
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

  async function handleUpdateProvider(updatedNode: ProviderNode) {
    setShowEditProvider(false);
    setEditingNode(null);
    await fetchData();
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
      <div className='flex items-center justify-between'>
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
        {isCompatible && isAdmin && node && (
          <Button
            variant='outline'
            size='sm'
            className='h-8 px-3 text-xs font-medium border-[rgba(203,213,225,0.6)] text-[--on-surface-variant] hover:text-[--on-surface]'
            onClick={() => {
              setEditingNode(node);
              setShowEditProvider(true);
            }}
          >
            Edit Provider
          </Button>
        )}
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
                      // Use node prefix for compatible providers, otherwise use provider alias
                      const providerPrefix = isCompatible ? (node?.prefix ?? decodedId) : getProviderAlias(decodedId);
                      const alias = m.startsWith(`${providerPrefix}/`)
                        ? m
                        : `${providerPrefix}/${m}`;
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

      <EditProviderModal
        isOpen={showEditProvider}
        node={editingNode}
        onClose={() => {
          setShowEditProvider(false);
          setEditingNode(null);
        }}
        onUpdated={handleUpdateProvider}
      />
    </div>
  );
}
