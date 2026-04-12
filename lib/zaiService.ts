/**
 * ZAI Service — server-side proxy for api.z.ai monitoring APIs.
 *
 * Proxies requests to ZAI's usage monitoring endpoints, keeping the
 * bearer token server-side.
 */

// ─── Types ──────────────────────────────────────────────────────────────────────

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

// ─── Constants ───────────────────────────────────────────────────────────────────

const ZAI_BASE = "https://api.z.ai";
const ZAI_TOKEN = process.env.ZAI_USAGE_TOKEN ?? "";

// ─── Core helpers ───────────────────────────────────────────────────────────────

async function zaiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en",
    Authorization: `Bearer ${ZAI_TOKEN}`,
    Origin: "https://z.ai",
    Referer: "https://z.ai/manage-apikey/subscription",
    ...(init.headers as Record<string, string> | undefined),
  };

  const url = path.startsWith("http") ? path : `${ZAI_BASE}${path}`;
  return fetch(url, { ...init, headers });
}

// ─── Public API ─────────────────────────────────────────────────────────────────

export async function getQuotaLimit(): Promise<ZaiQuotaResponse> {
  const res = await zaiFetch("/api/monitor/usage/quota/limit");
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ZAI quota API failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<ZaiQuotaResponse>;
}

export async function getModelPerformance(
  startTime: string,
  endTime: string
): Promise<ZaiPerformanceResponse> {
  const res = await zaiFetch(
    `/api/monitor/usage/model-performance-day?startTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}`
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ZAI performance API failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<ZaiPerformanceResponse>;
}

export async function getModelUsage(startTime: string, endTime: string): Promise<ZaiUsageResponse> {
  const res = await zaiFetch(
    `/api/monitor/usage/model-usage?startTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}`
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ZAI usage API failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<ZaiUsageResponse>;
}
