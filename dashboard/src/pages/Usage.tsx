import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api.ts";
import type { UsageStats, UsageRecord, ApiKeyRecord } from "@/lib/types.ts";
import type { ProviderNode } from "@/lib/api";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { OverviewTab } from "@/components/usage/OverviewTab";
import { DetailsTab } from "@/components/usage/DetailsTab";

const PERIODS = ["24h", "7d", "30d", "all"] as const;
type Period = (typeof PERIODS)[number];

export default function Usage() {
  const [period, setPeriod] = useState<Period>("24h");
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [recentRows, setRecentRows] = useState<UsageRecord[]>([]);
  const [apiKeyMap, setApiKeyMap] = useState<Map<string, string>>(new Map());
  const [nodes, setNodes] = useState<ProviderNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const esRef = useRef<EventSource | null>(null);

  const loadStats = useCallback(async (p: Period) => {
    setLoading(true);
    try {
      const data = (await api.usage.stats(p)) as UsageStats;
      setStats(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRecent = useCallback(async () => {
    try {
      const data = (await api.usage.requestDetails({
        limit: "15",
        offset: "0",
      })) as {
        rows: UsageRecord[];
        total: number;
      };
      setRecentRows(data.rows ?? []);
    } catch {
      // silently fail
    }
  }, []);

  const loadApiKeys = useCallback(async () => {
    try {
      const data = (await api.keys.list()) as { keys: ApiKeyRecord[] };
      const map = new Map<string, string>();
      for (const k of data.keys ?? []) map.set(k.id, k.name);
      setApiKeyMap(map);
    } catch {
      // silently fail
    }
  }, []);

  const loadNodes = useCallback(async () => {
    try {
      const data = (await api.providers.nodes()) as { nodes: ProviderNode[] };
      setNodes(data.nodes ?? []);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    loadStats(period);
    const id = setInterval(() => loadStats(period), 30_000);
    return () => clearInterval(id);
  }, [period, loadStats]);

  useEffect(() => {
    loadRecent();
    loadApiKeys();
    loadNodes();
  }, [loadRecent, loadApiKeys, loadNodes]);

  useEffect(() => {
    const es = new EventSource("/api/usage/stream");
    esRef.current = es;
    es.onmessage = (e) => {
      try {
        JSON.parse(e.data);
        loadStats(period);
        loadRecent();
      } catch {
        /* heartbeat */
      }
    };
    return () => {
      es.close();
      esRef.current = null;
    };
  }, [period, loadStats, loadRecent]);

  return (
    <div className='space-y-6'>
      {/* Page Header */}
      <div className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4'>
        <div>
          <h1 className='font-headline text-2xl sm:text-3xl font-bold tracking-tight text-[--on-surface]'>
            Usage
          </h1>
          <p className='text-xs uppercase tracking-[0.12em] text-[--on-surface-variant] mt-1 sm:mt-1.5 font-medium'>
            Monitor your API usage and token consumption
          </p>
        </div>
        {/* Period selector — only relevant on Overview */}
        {activeTab === "overview" && (
          <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <TabsList className='h-8 sm:h-9 bg-[--surface-container-low] rounded-lg p-1'>
              {PERIODS.map((p) => (
                <TabsTrigger
                  key={p}
                  value={p}
                  className='h-6 sm:h-7 px-2 sm:px-3 rounded text-xs sm:text-sm font-medium data-[state=active]:bg-[--surface-container-lowest] data-[state=active]:shadow-sm'
                >
                  {p}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
      </div>

      {/* Overview / Details tab switcher */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className='h-9 bg-[--surface-container-low] rounded-lg p-1'>
          <TabsTrigger
            value='overview'
            className='h-7 px-4 rounded text-sm font-medium data-[state=active]:bg-[--surface-container-lowest] data-[state=active]:shadow-sm'
          >
            Overview
          </TabsTrigger>
          <TabsTrigger
            value='details'
            className='h-7 px-4 rounded text-sm font-medium data-[state=active]:bg-[--surface-container-lowest] data-[state=active]:shadow-sm'
          >
            Details
          </TabsTrigger>
        </TabsList>

        <TabsContent value='overview' className='mt-6'>
          {loading && !stats ? (
            <div className='p-12 text-center'>
              <p className='text-[--on-surface-variant] text-sm'>Loading…</p>
            </div>
          ) : stats ? (
            <OverviewTab
              period={period}
              stats={stats}
              recentRows={recentRows}
              apiKeyMap={apiKeyMap}
              nodes={nodes}
            />
          ) : null}
        </TabsContent>

        <TabsContent value='details' className='mt-6'>
          <DetailsTab apiKeyMap={apiKeyMap} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
