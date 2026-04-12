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
import type { EditConnectionModalProps } from "./types";

export function EditConnectionModal({
  isOpen,
  connection,
  isOAuth,
  onSave,
  onClose,
}: EditConnectionModalProps) {
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
      <DialogContent className="bg-[--surface-container-lowest] rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)] max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline text-lg font-bold">Edit Connection</DialogTitle>
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
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]">
              {isOAuth ? "Refresh Token" : "API Key"}{" "}
              <span className="font-normal normal-case tracking-normal text-[--on-surface-variant]">
                (leave blank to keep current)
              </span>
            </Label>
            <Input
              type="password"
              value={form.apiKey}
              onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
              placeholder={isOAuth ? "Enter refresh token..." : "sk-..."}
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
