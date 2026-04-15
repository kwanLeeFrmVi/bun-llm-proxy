import { useState } from "react";
import { Check, AlertCircle } from "lucide-react";

interface DiscordCardProps {
  discordId: string;
  onSave: (discordId: string) => Promise<void>;
}

export function DiscordCard({ discordId: initialDiscordId, onSave }: DiscordCardProps) {
  const [discordId, setDiscordId] = useState(initialDiscordId ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      await onSave(discordId);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save Discord ID");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-xl bg-card p-5 border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        {/* Discord icon SVG */}
        <svg
          viewBox="0 0 24 24"
          className="w-5 h-5"
          fill="#5865F2"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
        </svg>
        <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--on-surface-variant)] font-600">
          Discord ID
        </span>
        {saved ? (
          <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-green-500">
            <Check className="w-3 h-3" />
            Saved
          </span>
        ) : initialDiscordId ? (
          <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-green-500">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            Linked
          </span>
        ) : null}
      </div>

      <p className="text-[11px] text-[var(--on-surface-variant)] mb-3 leading-relaxed">
        Link your Discord for priority support & exclusive giveaways
      </p>

      {initialDiscordId && (
        <p className="text-[11px] text-[var(--on-surface-variant)] mb-2">
          Current Discord ID:{" "}
          <span className="font-mono text-[var(--on-surface)]">{initialDiscordId}</span>
        </p>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={discordId}
          onChange={(e) => setDiscordId(e.target.value)}
          placeholder="e.g. 157681725529391104"
          className="flex-1 px-3 py-2 rounded-lg bg-[var(--surface-container-low)] border border-[rgba(203,213,225,0.5)] text-[12px] text-[var(--on-surface)] placeholder:text-[var(--on-surface-variant)] focus:outline-none focus:border-blue-500 transition-colors"
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-blue-500 text-white text-[12px] font-semibold hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      <p className="text-[10px] text-[var(--on-surface-variant)] mt-2">
        To remove your Discord ID, leave empty and save.
      </p>

      {error && (
        <div className="flex items-center gap-1.5 mt-2 text-red-500">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <p className="text-[11px]">{error}</p>
        </div>
      )}
    </div>
  );
}
