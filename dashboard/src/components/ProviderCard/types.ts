import type { ProviderCatalog, ProviderNode, ProviderConnection } from "@/lib/api";

export interface ProviderStats {
  connected: number;
  error: number;
  total: number;
  connections?: ProviderConnection[];
  lastError?: string | null;
  errorCode?: number | null;
}

export interface ProviderCardProps {
  providerId: string;
  catalog?: ProviderCatalog;
  node?: ProviderNode;
  stats: ProviderStats;
  onToggle?: (active: boolean) => void;
  onRefresh?: () => Promise<void>;
}
