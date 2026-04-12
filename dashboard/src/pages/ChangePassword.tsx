import { useState } from "react";
import { useAuth } from "@/lib/auth.tsx";
import { api } from "@/lib/api.ts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, ShieldCheck } from "lucide-react";

export default function ChangePassword() {
  const { userId, username } = useAuth();
  const [current, setCurrent] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = current.trim().length >= 6 && newPw.trim().length >= 6 && newPw === confirm;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    if (newPw !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await api.users.changePassword(userId, newPw.trim());
      toast.success("Password changed successfully");
      setCurrent("");
      setNewPw("");
      setConfirm("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setLoading(false);
    }
  }

  const cardStyle =
    "bg-[--surface-container-lowest] rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)]";

  return (
    <div className="space-y-6 max-w-lg">
      {/* Header */}
      <div>
        <h1 className="font-headline text-2xl sm:text-3xl font-bold tracking-tight text-[--on-surface]">
          Change Password
        </h1>
        <p className="text-xs uppercase tracking-[0.12em] text-[--on-surface-variant] mt-1 font-medium">
          Update your account password
        </p>
      </div>

      {/* Card */}
      <div className={cardStyle + " p-6"}>
        <div className="flex items-center gap-3 mb-6">
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-[--primary-fixed] text-[--on-primary-fixed]">
            <KeyRound className="w-5 h-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-[--on-surface]">{username}</p>
            <p className="text-xs text-[--on-surface-variant]">Your account</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]">
              Current Password
            </Label>
            <Input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="Enter current password"
              className="h-11 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm focus:border-[--primary]"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]">
              New Password
            </Label>
            <Input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="Minimum 6 characters"
              className="h-11 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm focus:border-[--primary]"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]">
              Confirm New Password
            </Label>
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat new password"
              onKeyDown={(e) =>
                e.key === "Enter" && canSubmit && handleSubmit(e as unknown as React.FormEvent)
              }
              className={
                "h-11 bg-[--surface-container-low] border rounded-lg text-sm focus:border-[--primary] " +
                (confirm && newPw !== confirm ? "border-red-400" : "border-[--outline-variant]")
              }
            />
            {confirm && newPw !== confirm && (
              <p className="text-xs text-red-500">Passwords do not match</p>
            )}
          </div>

          <div className="pt-2 flex items-center gap-3">
            <Button
              type="submit"
              disabled={!canSubmit || loading}
              className="h-11 px-6 rounded-lg font-semibold text-sm bg-[#0F172A] text-white hover:bg-[#1e293b] transition-colors"
            >
              {loading ? "Saving…" : "Update Password"}
            </Button>
            {canSubmit && (
              <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                <ShieldCheck className="w-3.5 h-3.5" /> Ready to save
              </span>
            )}
          </div>
        </form>
      </div>

      {/* Tip */}
      <p className="text-xs text-[--on-surface-variant] leading-relaxed">
        Use a strong, unique password with at least 8 characters. Avoid reusing passwords from other
        services.
      </p>
    </div>
  );
}
