import type { ProviderConnection } from "@/lib/api";

export interface ProviderModel {
  id: string;
  name?: string;
  type?: string;
}

export interface ModelsResponse {
  provider: string;
  alias: string;
  models: ProviderModel[];
}

export type TestStatus = "ok" | "error" | null;

export type StatusVariant = "success" | "error" | "default";

export interface ConnectionRowProps {
  conn: ProviderConnection;
  isFirst: boolean;
  isLast: boolean;
  isAdmin: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggle: (v: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onTest: (id: string) => void;
}

export interface AddApiKeyModalProps {
  isOpen: boolean;
  providerId: string;
  providerName: string;
  onSave: (data: { name: string; apiKey: string; priority: number }) => void;
  onClose: () => void;
}

export interface EditConnectionModalProps {
  isOpen: boolean;
  connection: ProviderConnection | null;
  isOAuth?: boolean;
  onSave: (
    id: string,
    data: {
      name: string;
      priority: number;
      refreshToken?: string;
      apiKey?: string;
    },
  ) => void;
  onClose: () => void;
}

export interface AddCustomModelModalProps {
  isOpen: boolean;
  providerId: string;
  providerPrefix?: string;  // Effective prefix for showing the full model ID preview
  onAdd: (modelId: string) => void;
  onClose: () => void;
}

export interface ModelTileProps {
  modelId: string;
  alias?: string;
  onCopy: (id: string) => void;
  copied: string | null;
  onTest?: () => void;
  isTesting?: boolean;
  testStatus?: TestStatus;
  onDelete?: () => void;
}
