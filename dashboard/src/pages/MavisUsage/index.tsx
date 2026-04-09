import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api.ts";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, AlertCircle } from "lucide-react";
import type { MavisUsageResponse, MavisUserProfile } from "@/lib/mavisTypes.ts";
import { RANGES, type Range } from "./utils/constants.ts";
import { buildPricingMap } from "./utils/pricing.ts";
import { QuotaCards } from "./components/QuotaCards.tsx";
import { ModelTable } from "./components/ModelTable.tsx";
import { TimeseriesChart } from "./components/TimeseriesChart.tsx";
import { PricingTable } from "./components/PricingTable.tsx";

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
            variant='outline'
            size='sm'
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
        <p
          style={{
            fontSize: "11px",
            color: "var(--on-surface-variant)",
            marginTop: "-8px",
          }}
        >
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
            style={{
              width: "20px",
              height: "20px",
              color: "#ef4444",
              flexShrink: 0,
            }}
          />
          <div>
            <p style={{ fontSize: "13px", fontWeight: 600, color: "#ef4444" }}>
              Failed to load Mavis data
            </p>
            <p
              style={{
                fontSize: "11px",
                color: "var(--on-surface-variant)",
                marginTop: "4px",
              }}
            >
              {error}
            </p>
            <p
              style={{
                fontSize: "11px",
                color: "var(--on-surface-variant)",
                marginTop: "4px",
              }}
            >
              Make sure{" "}
              <code
                style={{
                  fontSize: "11px",
                  background: "var(--surface-container-low)",
                  padding: "2px 6px",
                  borderRadius: "4px",
                }}
              >
                MAVIS_USERNAME
              </code>{" "}
              and{" "}
              <code
                style={{
                  fontSize: "11px",
                  background: "var(--surface-container-low)",
                  padding: "2px 6px",
                  borderRadius: "4px",
                }}
              >
                MAVIS_PASSWORD
              </code>{" "}
              are set in your{" "}
              <code
                style={{
                  fontSize: "11px",
                  background: "var(--surface-container-low)",
                  padding: "2px 6px",
                  borderRadius: "4px",
                }}
              >
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
          <p
            style={{
              fontSize: "13px",
              color: "var(--on-surface-variant)",
              marginTop: "12px",
            }}
          >
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
