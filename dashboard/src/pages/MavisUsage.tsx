import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, AlertCircle } from "lucide-react";
import type { MavisUsageResponse, MavisUserProfile } from "@/lib/mavisTypes.ts";

// ─── Constants ──────────────────────────────────────────────────────────────────

const RANGES = ["24h", "7d", "30d", "all"] as const;
type Range = (typeof RANGES)[number];

// ─── Pure helpers ───────────────────────────────────────────────────────────────

function buildPricingMap(
  pricing: MavisUsageResponse["model_pricing"],
): Record<string, { input_ratio: number; output_ratio: number }> {
  const map: Record<string, { input_ratio: number; output_ratio: number }> = {};
  for (const p of pricing) {
    map[p.model] = { input_ratio: p.input_ratio, output_ratio: p.output_ratio };
  }
  return map;
}

function estimateCost(
  inputTokens: number,
  outputTokens: number,
  pricing: { input_ratio: number; output_ratio: number } | undefined,
): number {
  if (!pricing) return 0;
  return (
    (inputTokens * pricing.input_ratio + outputTokens * pricing.output_ratio) /
    1_000_000
  );
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

function fmtDate(iso: string): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function pct(used: number, total: number): number {
  if (!total) return 0;
  return Math.min(100, Math.round((used / total) * 100));
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

// Quota progress bar — inline to avoid style= object issues
function ProgressBar({ value }: { value: number }) {
  const color =
    value > 80 ? "#ef4444" : value > 50 ? "#f59e0b" : "#22c55e";
  return (
    <div
      style={{
        marginTop: "12px",
        height: "6px",
        borderRadius: "9999px",
        background: "rgba(203,213,225,0.3)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: value + "%",
          borderRadius: "9999px",
          background: color,
          transition: "width 0.5s ease",
        }}
      />
    </div>
  );
}

function QuotaCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div
      style={{
        background: "var(--surface-container-lowest)",
        borderRadius: "12px",
        padding: "24px",
        border: "1px solid rgba(203,213,225,0.6)",
        boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
        overflow: "hidden",
      }}
    >
      <p
        style={{
          fontSize: "10px",
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: "var(--on-surface-variant)",
          fontWeight: 600,
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: "28px",
          fontWeight: 700,
          marginTop: "4px",
          color: color ?? "var(--on-surface)",
          fontFamily: "var(--font-headline)",
        }}
      >
        {value}
      </p>
      {sub && (
        <p
          style={{
            fontSize: "11px",
            color: "var(--on-surface-variant)",
            marginTop: "4px",
          }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

function QuotaCards({
  profile,
  usage,
}: {
  profile: MavisUserProfile | null;
  usage: MavisUsageResponse | null;
}) {
  const quota = profile?.quota ?? usage?.quota ?? 0;
  const usedQuota = profile?.usedQuota ?? usage?.used_quota ?? 0;
  const requests = usage?.summary?.total_requests ?? 0;
  const success = usage?.summary?.success_count ?? 0;
  const failures = usage?.summary?.failure_count ?? 0;
  const resetAt = profile?.periodResetAt ?? usage?.period_reset_at ?? "";
  const planName = profile?.planName ?? usage?.plan_name ?? "-";
  const period = profile?.planPeriod ?? usage?.plan_period ?? "";
  const p = pct(usedQuota, quota);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "16px",
      }}
    >
      <QuotaCard label="Plan" value={planName} sub="Current plan" />
      <div
        style={{
          background: "var(--surface-container-lowest)",
          borderRadius: "12px",
          padding: "24px",
          border: "1px solid rgba(203,213,225,0.6)",
          boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
        }}
      >
        <p
          style={{
            fontSize: "10px",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: "var(--on-surface-variant)",
            fontWeight: 600,
          }}
        >
          Quota Used
        </p>
        <p
          style={{
            fontSize: "28px",
            fontWeight: 700,
            marginTop: "4px",
            color: "var(--primary)",
            fontFamily: "var(--font-headline)",
          }}
        >
          {fmt(usedQuota)}
        </p>
        <p
          style={{
            fontSize: "11px",
            color: "var(--on-surface-variant)",
            marginTop: "4px",
          }}
        >
          of {fmt(quota)}
        </p>
        <ProgressBar value={p} />
        <p
          style={{
            fontSize: "11px",
            color: "var(--on-surface-variant)",
            marginTop: "6px",
          }}
        >
          {p}% used
        </p>
      </div>
      <QuotaCard
        label="Requests"
        value={fmt(requests)}
        sub={`${success} ok / ${failures} failed`}
      />
      <QuotaCard label="Reset Date" value={fmtDate(resetAt)} sub={`${period} period`} />
    </div>
  );
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div
      style={{
        padding: "16px 24px",
        borderBottom: "1px solid rgba(203,213,225,0.4)",
      }}
    >
      <p
        style={{
          fontSize: "13px",
          fontWeight: 600,
          color: "var(--on-surface)",
        }}
      >
        {title}
      </p>
      {sub && (
        <p
          style={{
            fontSize: "11px",
            color: "var(--on-surface-variant)",
            marginTop: "2px",
          }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

function ModelTable({
  usage,
  pricing,
}: {
  usage: MavisUsageResponse | null;
  pricing: ReturnType<typeof buildPricingMap>;
}) {
  const models = usage?.models ?? [];
  const totalTokens = usage?.summary?.total_tokens ?? 0;

  if (models.length === 0) {
    return (
      <div
        style={{
          padding: "40px",
          textAlign: "center",
          color: "var(--on-surface-variant)",
          fontSize: "13px",
        }}
      >
        No model data available.
      </div>
    );
  }

  const rows = models.map((m) => {
    const pr = pricing[m.model];
    const cost = estimateCost(m.input_tokens, m.output_tokens, pr);
    const share =
      totalTokens > 0 ? Math.round((m.total_tokens / totalTokens) * 100) : 0;
    return { m, cost, share };
  });

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
        title="Usage by Model"
        sub="Token breakdown and estimated cost per model"
      />
      <div style={{ overflowX: "auto" }}>
        <Table>
          <TableHeader>
            <TableRow
              style={{
                borderBottom: "1px solid rgba(203,213,225,0.4)",
              }}
            >
              <TableHead style={{ padding: "12px 24px", color: "var(--on-surface-variant)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Model
              </TableHead>
              <TableHead style={{ padding: "12px", color: "var(--on-surface-variant)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.1em", textAlign: "right" }}>
                Requests
              </TableHead>
              <TableHead style={{ padding: "12px", color: "var(--on-surface-variant)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.1em", textAlign: "right" }}>
                Input Tokens
              </TableHead>
              <TableHead style={{ padding: "12px", color: "var(--on-surface-variant)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.1em", textAlign: "right" }}>
                Output Tokens
              </TableHead>
              <TableHead style={{ padding: "12px", color: "var(--on-surface-variant)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.1em", textAlign: "right" }}>
                Failures
              </TableHead>
              <TableHead style={{ padding: "12px 24px", color: "var(--on-surface-variant)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.1em", textAlign: "right" }}>
                Est. Cost
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ m, cost, share }) => (
              <TableRow
                key={m.model}
                style={{
                  borderBottom: "1px solid rgba(203,213,225,0.25)",
                }}
              >
                <TableCell style={{ padding: "12px 24px" }}>
                  <Badge variant="endpoint">{m.model}</Badge>
                  {share > 15 && (
                    <div
                      style={{
                        marginTop: "6px",
                        height: "3px",
                        borderRadius: "9999px",
                        background: "rgba(34,197,94,0.25)",
                        width: "100%",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: share + "%",
                          borderRadius: "9999px",
                          background: "#22c55e",
                        }}
                      />
                    </div>
                  )}
                </TableCell>
                <TableCell style={{ padding: "12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {m.requests.toLocaleString()}
                </TableCell>
                <TableCell style={{ padding: "12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--primary)" }}>
                  {m.input_tokens.toLocaleString()}
                </TableCell>
                <TableCell style={{ padding: "12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {m.output_tokens.toLocaleString()}
                </TableCell>
                <TableCell style={{ padding: "12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: m.failures > 0 ? "#ef4444" : "var(--on-surface-variant)" }}>
                  {m.failures}
                </TableCell>
                <TableCell style={{ padding: "12px 24px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  ${cost.toFixed(4)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function TimeseriesChart({ usage }: { usage: MavisUsageResponse | null }) {
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
        title="Token Usage Over Time"
        sub="Daily tokens and request volume"
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
            <span style={{ fontSize: "11px", color: "var(--on-surface-variant)" }}>
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
            <span style={{ fontSize: "11px", color: "var(--on-surface-variant)" }}>
              Requests x100
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PricingTable({ usage }: { usage: MavisUsageResponse | null }) {
  const pricing = usage?.model_pricing ?? [];
  if (pricing.length === 0) return null;

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
        title="Model Pricing Ratios"
        sub="Input/output ratio for cost estimation"
      />
      <Table>
        <TableHeader>
          <TableRow
            style={{ borderBottom: "1px solid rgba(203,213,225,0.4)" }}
          >
            <TableHead style={{ padding: "12px 24px", color: "var(--on-surface-variant)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Model
            </TableHead>
            <TableHead style={{ padding: "12px", color: "var(--on-surface-variant)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.1em", textAlign: "right" }}>
              Input Ratio
            </TableHead>
            <TableHead style={{ padding: "12px 24px", color: "var(--on-surface-variant)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.1em", textAlign: "right" }}>
              Output Ratio
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pricing.map((p) => (
            <TableRow
              key={p.model}
              style={{ borderBottom: "1px solid rgba(203,213,225,0.25)" }}
            >
              <TableCell style={{ padding: "12px 24px" }}>
                <Badge variant="secondary">{p.model}</Badge>
              </TableCell>
              <TableCell style={{ padding: "12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--primary)" }}>
                {p.input_ratio}
              </TableCell>
              <TableCell style={{ padding: "12px 24px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {p.output_ratio}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Root ──────────────────────────────────────────────────────────────────────

export default function MavisUsage() {
  const [range, setRange] = useState<Range>("7d");
  const [profile, setProfile] = useState<MavisUserProfile | null>(null);
  const [usage, setUsage] = useState<MavisUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [profileData, usageData] = await Promise.all([
        api.mavis.getMe() as Promise<MavisUserProfile>,
        api.mavis.getUsage(range) as Promise<MavisUsageResponse>,
      ]);
      setProfile(profileData);
      setUsage(usageData);
      setLastUpdated(new Date());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load from Mavis",
      );
    } finally {
      setLoading(false);
    }
  }, [range]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await api.mavis.refresh();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!refreshing) load();
    }, 60_000);
    return () => clearInterval(id);
  }, [load, refreshing]);

  const pricing = usage ? buildPricingMap(usage.model_pricing) : {};

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "var(--font-headline)",
              fontSize: "28px",
              fontWeight: 700,
              color: "var(--on-surface)",
              letterSpacing: "-0.02em",
            }}
          >
            Mavis Usage
          </h1>
          <p
            style={{
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: "var(--on-surface-variant)",
              marginTop: "4px",
              fontWeight: 500,
            }}
          >
            Upstream LLM Gateway &middot; mavis.io.vn
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
            <TabsList
              style={{
                height: "36px",
                background: "var(--surface-container-low)",
                borderRadius: "8px",
                padding: "4px",
              }}
            >
              {RANGES.map((r) => (
                <TabsTrigger
                  key={r}
                  value={r}
                  style={{
                    height: "28px",
                    paddingLeft: "12px",
                    paddingRight: "12px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: 500,
                  }}
                >
                  {r}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            style={{ height: "36px" }}
          >
            <RefreshCw
              style={{
                width: "14px",
                height: "14px",
                marginRight: "6px",
                animation: refreshing ? "spin 1s linear infinite" : "none",
              }}
            />
            {refreshing ? "Refreshing" : "Refresh"}
          </Button>
        </div>
      </div>

      {lastUpdated && (
        <p style={{ fontSize: "11px", color: "var(--on-surface-variant)", marginTop: "-8px" }}>
          Last updated: {lastUpdated.toLocaleTimeString()}
        </p>
      )}

      {error && (
        <div
          style={{
            background: "var(--surface-container-lowest)",
            borderRadius: "12px",
            padding: "24px",
            border: "1px solid rgba(203,213,225,0.6)",
            display: "flex",
            gap: "12px",
          }}
        >
          <AlertCircle
            style={{ width: "20px", height: "20px", color: "#ef4444", flexShrink: 0 }}
          />
          <div>
            <p style={{ fontSize: "13px", fontWeight: 600, color: "#ef4444" }}>
              Failed to load Mavis data
            </p>
            <p style={{ fontSize: "11px", color: "var(--on-surface-variant)", marginTop: "4px" }}>
              {error}
            </p>
            <p style={{ fontSize: "11px", color: "var(--on-surface-variant)", marginTop: "4px" }}>
              Make sure{" "}
              <code style={{ fontSize: "11px", background: "var(--surface-container-low)", padding: "2px 6px", borderRadius: "4px" }}>
                MAVIS_USERNAME
              </code>{" "}
              and{" "}
              <code style={{ fontSize: "11px", background: "var(--surface-container-low)", padding: "2px 6px", borderRadius: "4px" }}>
                MAVIS_PASSWORD
              </code>{" "}
              are set in your{" "}
              <code style={{ fontSize: "11px", background: "var(--surface-container-low)", padding: "2px 6px", borderRadius: "4px" }}>
                .env
              </code>{" "}
              file.
            </p>
          </div>
        </div>
      )}

      {loading && !usage ? (
        <div style={{ padding: "48px", textAlign: "center" }}>
          <div
            style={{
              width: "24px",
              height: "24px",
              border: "2px solid var(--primary)",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
              display: "inline-block",
            }}
          />
          <p style={{ fontSize: "13px", color: "var(--on-surface-variant)", marginTop: "12px" }}>
            Loading from mavis.io.vn
          </p>
        </div>
      ) : (
        <>
          <QuotaCards profile={profile} usage={usage} />
          <ModelTable usage={usage} pricing={pricing} />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: "16px",
            }}
          >
            <TimeseriesChart usage={usage} />
            <PricingTable usage={usage} />
          </div>
        </>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
