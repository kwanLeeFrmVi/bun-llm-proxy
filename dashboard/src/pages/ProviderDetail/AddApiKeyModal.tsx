import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { AddApiKeyModalProps } from "./types";

export function AddApiKeyModal({
  isOpen,
  providerId: _providerId,
  providerName,
  onSave,
  onClose,
}: AddApiKeyModalProps) {
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
            <Label className="text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]">
              Name
            </Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Production Key"
              className="h-11 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]">
              API Key
            </Label>
            <div className="flex gap-2">
              <Input
                type="password"
                value={form.apiKey}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    apiKey: e.target.value,
                    checkResult: null,
                  }))
                }
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
              <p
                className={`text-xs font-medium ${checkResult === "success" ? "text-green-600" : "text-red-500"}`}
              >
                {checkResult === "success" ? "Key looks valid" : "Key looks invalid"}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]">
              Priority
            </Label>
            <Input
              type="number"
              min={1}
              value={form.priority}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  priority: parseInt(e.target.value) || 1,
                }))
              }
              className="h-11 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm"
            />
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
