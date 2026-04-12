import { useState, useEffect } from "react";
import { api, ProviderNode } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface Props {
  isOpen: boolean;
  node: ProviderNode | null;
  onClose: () => void;
  onUpdated: (node: ProviderNode) => void;
}

const API_TYPES = [
  { value: "chat", label: "Chat Completions" },
  { value: "responses", label: "Responses API" },
];

export function EditProviderModal({ isOpen, node, onClose, onUpdated }: Props) {
  const [form, setForm] = useState({
    name: "",
    baseUrl: "",
    apiType: "chat",
  });
  const [submitting, setSubmitting] = useState(false);
  const [showApiType, setShowApiType] = useState(false);

  useEffect(() => {
    if (isOpen && node) {
      setForm({
        name: node.name ?? "",
        baseUrl: node.baseUrl ?? "",
        apiType: node.apiType ?? "chat",
      });
      setShowApiType(node.type === "openai-compatible");
    }
  }, [isOpen, node]);

  async function handleSave() {
    if (!node || !form.name.trim() || !form.baseUrl.trim()) return;
    setSubmitting(true);
    try {
      const data: { name: string; baseUrl: string; apiType?: string } = {
        name: form.name.trim(),
        baseUrl: form.baseUrl.trim(),
      };
      if (showApiType) {
        data.apiType = form.apiType;
      }
      const res = await api.nodes.update(node.id, data);
      onUpdated((res as { node: ProviderNode }).node);
      toast.success("Provider updated successfully");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update provider");
    } finally {
      setSubmitting(false);
    }
  }

  const canSave = form.name.trim() && form.baseUrl.trim() && !submitting;

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[--surface-container-lowest] rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)] max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline text-lg font-bold">Edit Provider</DialogTitle>
          <DialogDescription className="text-sm text-[--on-surface-variant]">
            Update the provider name and base URL.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]">
              Name
            </Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Provider Name"
              className="h-11 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm"
            />
            <p className="text-xs text-[--on-surface-variant]">
              A friendly label for this provider.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]">
              Base URL
            </Label>
            <Input
              value={form.baseUrl}
              onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
              placeholder="https://api.example.com/v1"
              className="h-11 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm"
            />
            <p className="text-xs text-[--on-surface-variant]">
              The base URL for the provider API.
            </p>
          </div>

          {showApiType && (
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]">
                API Type
              </Label>
              <select
                value={form.apiType}
                onChange={(e) => setForm((f) => ({ ...f, apiType: e.target.value }))}
                className="h-11 w-full bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm px-3"
              >
                {API_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          )}
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
            onClick={handleSave}
            disabled={!canSave}
            className="h-10 px-5 rounded font-semibold text-sm bg-[#0F172A] text-white hover:bg-[#1e293b]"
          >
            {submitting ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
