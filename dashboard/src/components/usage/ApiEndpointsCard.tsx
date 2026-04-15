import { useState } from "react";
import { Copy, Check } from "lucide-react";

interface Endpoint {
  label: string;
  url: string;
}

interface ApiEndpointsCardProps {
  endpoints: Endpoint[];
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API unavailable — silently skip
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all shrink-0"
      style={{
        background: copied ? "rgba(34,197,94,0.15)" : "rgba(34,197,94,0.1)",
        color: copied ? "#22c55e" : "rgba(34,197,94,0.9)",
        border: `1px solid ${copied ? "rgba(34,197,94,0.4)" : "rgba(34,197,94,0.25)"}`,
      }}
    >
      {copied ? (
        <>
          <Check className="w-3 h-3" />
          Copied
        </>
      ) : (
        <>
          <Copy className="w-3 h-3" />
          Copy
        </>
      )}
    </button>
  );
}

export function ApiEndpointsCard({ endpoints }: ApiEndpointsCardProps) {
  return (
    <div
      className="rounded-xl bg-card overflow-hidden border border-green-500/30 shadow-[0_8px_30px_rgba(0,0,0,0.06)]"
      style={{ boxShadow: "0 8px 30px rgba(0,0,0,0.06), inset 0 0 0 1px rgba(34,197,94,0.15)" }}
    >
      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-green-500/20">
        <p
          className="text-[13px] font-semibold text-[var(--on-surface)]"
          style={{ color: "#22c55e" }}
        >
          API Endpoints
        </p>
        <p className="text-[11px] text-[var(--on-surface-variant)] mt-0.5">
          Copy endpoints to configure your client
        </p>
      </div>

      {/* Endpoints */}
      <div className="divide-y divide-[rgba(203,213,225,0.2)]">
        {endpoints.map((ep) => (
          <div key={ep.label} className="flex items-center gap-3 px-5 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--on-surface-variant)] font-600 mb-0.5">
                {ep.label}
              </p>
              <p className="text-[12px] font-mono text-[var(--on-surface)] truncate">{ep.url}</p>
            </div>
            <CopyButton text={ep.url} />
          </div>
        ))}
      </div>
    </div>
  );
}
