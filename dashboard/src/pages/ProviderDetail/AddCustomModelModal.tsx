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
import type { AddCustomModelModalProps } from "./types";

export function AddCustomModelModal({
  isOpen,
  providerId: _providerId,
  providerPrefix,
  onAdd,
  onClose,
}: AddCustomModelModalProps) {
  const [modelId, setModelId] = useState("");

  useEffect(() => {
    if (isOpen) setModelId("");
  }, [isOpen]);

  function handleAdd() {
    if (!modelId.trim()) return;
    onAdd(modelId.trim());
  }

  // Show what the full model ID will be
  const fullModelId =
    modelId.trim() && providerPrefix
      ? `${providerPrefix}/${modelId.trim()}`
      : modelId.trim() || (providerPrefix ? `${providerPrefix}/model-id` : "model-id");

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[--surface-container-lowest] rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)] max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline text-lg font-bold">Add Model</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]">
              Model ID
            </Label>
            <Input
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="e.g. claude-haiku-4-5-20251001"
              className="h-11 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm"
              autoFocus
            />
            <p className="text-xs text-[--on-surface-variant]">
              Will be saved as:{" "}
              <code className="font-mono bg-[--surface-container-low] px-1 rounded">
                {fullModelId}
              </code>
            </p>
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
