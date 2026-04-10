import { useState, useEffect } from "react";
import { api, ProviderNode } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (node: ProviderNode) => void;
}

export function AddAnthropicCompatibleModal({ isOpen, onClose, onCreated }: Props) {
  const [form, setForm] = useState({
    name: "",
    prefix: "",
    baseUrl: "https://api.anthropic.com/v1",
  });
  const [checkKey, setCheckKey] = useState("");
  const [checkModel, setCheckModel] = useState("");
  const [validating, setValidating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [validationResult, setValidationResult] = useState<{ valid: boolean; error?: string; method?: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setForm({ name: "", prefix: "", baseUrl: "https://api.anthropic.com/v1" });
      setCheckKey("");
      setCheckModel("");
      setValidationResult(null);
    }
  }, [isOpen]);

  async function handleValidate() {
    if (!checkKey || !form.baseUrl) return;
    setValidating(true);
    setValidationResult(null);
    try {
      const res = await api.nodes.validate({
        baseUrl: form.baseUrl,
        apiKey: checkKey,
        type: "anthropic-compatible",
        modelId: checkModel || undefined,
      });
      setValidationResult(res as { valid: boolean; error?: string; method?: string });
    } catch (e) {
      setValidationResult({ valid: false, error: e instanceof Error ? e.message : "Network error" });
    } finally {
      setValidating(false);
    }
  }

  async function handleCreate() {
    if (!form.name.trim() || !form.prefix.trim() || !form.baseUrl.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/provider-nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("auth_token")}` },
        body: JSON.stringify({ ...form, type: "anthropic-compatible" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create node");
      onCreated(data.node as ProviderNode);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = form.name.trim() && form.prefix.trim() && form.baseUrl.trim() && !submitting;

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)] max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline text-lg font-bold">Add Anthropic Compatible</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]">Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Anthropic Compatible (Prod)"
              className="h-11 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm"
            />
            <p className="text-xs text-[--on-surface-variant]">Required. A friendly label for this node.</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]">Prefix</Label>
            <Input
              value={form.prefix}
              onChange={(e) => setForm((f) => ({ ...f, prefix: e.target.value }))}
              placeholder="ac-prod"
              className="h-11 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm"
            />
            <p className="text-xs text-[--on-surface-variant]">Required. Used as the provider prefix for model IDs.</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]">Base URL</Label>
            <Input
              value={form.baseUrl}
              onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
              placeholder="https://api.anthropic.com/v1"
              className="h-11 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm"
            />
            <p className="text-xs text-[--on-surface-variant]">Use the base URL (ending in /v1). The system appends /messages.</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]">API Key (for Check)</Label>
            <Input
              type="password"
              value={checkKey}
              onChange={(e) => setCheckKey(e.target.value)}
              placeholder="sk-ant-..."
              className="h-11 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]">Model ID (optional)</Label>
            <Input
              value={checkModel}
              onChange={(e) => setCheckModel(e.target.value)}
              placeholder="e.g. claude-3-opus"
              className="h-11 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm"
            />
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleValidate}
              disabled={!checkKey || validating || !form.baseUrl.trim()}
            >
              {validating ? "Checking..." : "Check"}
            </Button>
            {validationResult && (
              validationResult.valid ? (
                <span className="text-xs text-green-600 font-medium">
                  ✓ Valid{validationResult.method === "chat" ? " (via chat)" : ""}
                </span>
              ) : (
                <span className="text-xs text-red-500">{validationResult.error}</span>
              )
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="h-10 px-4 rounded font-medium text-sm"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!canSubmit}
            className="h-10 px-5 rounded font-semibold text-sm bg-[#0F172A] text-white hover:bg-[#1e293b]"
          >
            {submitting ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
