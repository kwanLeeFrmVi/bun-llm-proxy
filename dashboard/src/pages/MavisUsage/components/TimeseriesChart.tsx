import type { MavisUsageResponse } from "@/lib/mavisTypes.ts";
import { SectionHeader } from "./SectionHeader.tsx";

export function TimeseriesChart({ usage }: { usage: MavisUsageResponse | null }) {
  const ts = usage?.timeseries ?? [];
  if (ts.length === 0) {
    return (
      <div
        style={{
          padding: "40px",
          textAlign: "center",
          color: "var(--on-surface-variant)",
          fontSize: "13px",
        }}
      >
        No timeseries data available.
      </div>
    );
  }

  const maxTokens = Math.max(...ts.map((d) => d.tokens), 1);

  return (
    <div
      style={{
        background: "var(--surface-container-lowest)",
        borderRadius: "12px",
        border: "1px solid rgba(203,213,225,0.6)",
        boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
        overflow: "hidden",
      }}
    >
      <SectionHeader
        title='Token Usage Over Time'
        sub='Daily tokens and request volume'
      />
      <div style={{ padding: "20px 24px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: "8px",
            height: "160px",
          }}
        >
          {ts.map((d, i) => {
            const barH = Math.max(2, Math.round((d.tokens / maxTokens) * 160));
            const reqH = Math.max(
              2,
              Math.round((d.requests / (maxTokens / 100)) * 160),
            );
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "4px",
                  position: "relative",
                }}
              >
                <div
                  title={`Tokens: ${d.tokens.toLocaleString()}`}
                  style={{
                    width: "100%",
                    borderRadius: "4px 4px 0 0",
                    background: "var(--primary)",
                    opacity: 0.8,
                    height: barH,
                  }}
                />
                <div
                  style={{
                    width: "100%",
                    borderRadius: "4px 4px 0 0",
                    background: "var(--on-surface-variant)",
                    opacity: 0.3,
                    height: reqH,
                  }}
                />
              </div>
            );
          })}
        </div>
        <div
          style={{
            display: "flex",
            gap: "8px",
            marginTop: "8px",
          }}
        >
          {ts.map((d, i) => (
            <div key={i} style={{ flex: 1, textAlign: "center" }}>
              <span
                style={{
                  fontSize: "10px",
                  color: "var(--on-surface-variant)",
                }}
              >
                {d.time.slice(5)}
              </span>
            </div>
          ))}
        </div>
        <div
          style={{
            display: "flex",
            gap: "16px",
            marginTop: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "2px",
                background: "var(--primary)",
                opacity: 0.8,
              }}
            />
            <span
              style={{ fontSize: "11px", color: "var(--on-surface-variant)" }}
            >
              Tokens
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "2px",
                background: "var(--on-surface-variant)",
                opacity: 0.3,
              }}
            />
            <span
              style={{ fontSize: "11px", color: "var(--on-surface-variant)" }}
            >
              Requests x100
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
