// Shared TypeScript types for Mavis API responses

export interface MavisUserProfile {
  id: number;
  username: string;
  isAdmin: boolean;
  quota: number;
  usedQuota: number;
  requestCount: number;
  group: string;
  role: number;
  status: number;
  isUnlimited: boolean;
  planId: number;
  planName: string;
  planType: string;
  planAllowance: number;
  planPeriod: string;
  planDuration: string;
  periodUsedQuota: number;
  periodResetAt: string;
}

export interface MavisModelPricing {
  model: string;
  input_ratio: number;
  output_ratio: number;
}

export interface MavisTimeseriesPoint {
  time: string;
  requests: number;
  tokens: number;
  failures: number;
}

export interface MavisModelTimeseries {
  time: string;
  model: string;
  requests: number;
  tokens: number;
}

export interface MavisUsageModel {
  model: string;
  api_key: string;
  requests: number;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  failures: number;
}

export interface MavisUsageSummary {
  total_requests: number;
  success_count: number;
  failure_count: number;
  total_tokens: number;
}

export interface MavisUsageResponse {
  all_time: MavisUsageSummary;
  is_unlimited: boolean;
  model_pricing: MavisModelPricing[];
  model_timeseries: MavisModelTimeseries[];
  models: MavisUsageModel[];
  period_reset_at: string;
  period_used_quota: number;
  plan_allowance: number;
  plan_duration: string;
  plan_id: number;
  plan_name: string;
  plan_period: string;
  plan_type: string;
  quota: number;
  range: string;
  request_count: number;
  summary: MavisUsageSummary;
  timeseries: MavisTimeseriesPoint[];
  used_quota: number;
}
