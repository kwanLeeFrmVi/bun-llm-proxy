// ─── Quota/Limit Types ─────────────────────────────────────────────────────────────

export interface ZaiUsageDetail {
  modelCode: string;
  usage: number;
}

export interface ZaiLimit {
  type: string; // "TIME_LIMIT" | "TOKENS_LIMIT"
  unit: number;
  number: number;
  usage?: number;
  currentValue?: number;
  remaining?: number;
  percentage: number;
  nextResetTime: number;
  usageDetails?: ZaiUsageDetail[];
}

export interface ZaiQuotaData {
  limits: ZaiLimit[];
  level: string;
}

export interface ZaiQuotaResponse {
  code: number;
  msg: string;
  data: ZaiQuotaData;
  success: boolean;
}

// ─── Model Performance Types ──────────────────────────────────────────────────────

export interface ZaiPerformanceData {
  x_time: string[];
  liteDecodeSpeed: number[];
  proMaxDecodeSpeed: number[];
  liteSuccessRate: number[];
  proMaxSuccessRate: number[];
}

export interface ZaiPerformanceResponse {
  code: number;
  msg: string;
  data: ZaiPerformanceData;
  success: boolean;
}

// ─── Model Usage Types ────────────────────────────────────────────────────────────

export interface ZaiModelSummary {
  modelName: string;
  totalTokens: number;
  sortOrder: number;
}

export interface ZaiModelData {
  modelName: string;
  sortOrder: number;
  tokensUsage: number[];
  totalTokens: number;
}

export interface ZaiTotalUsage {
  modelSummaryList: ZaiModelSummary[];
  totalModelCallCount: number;
  totalTokensUsage: number;
}

export interface ZaiUsageData {
  granularity: string;
  modelCallCount: number[];
  modelDataList: ZaiModelData[];
  modelSummaryList: ZaiModelSummary[];
  tokensUsage: number[];
  totalUsage: ZaiTotalUsage;
  x_time: string[];
}

export interface ZaiUsageResponse {
  code: number;
  msg: string;
  data: ZaiUsageData;
  success: boolean;
}

// ─── Date Range Type ─────────────────────────────────────────────────────────────

export type DateRange = "24h" | "7d" | "30d";
