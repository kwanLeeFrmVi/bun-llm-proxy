// Shared TypeScript types for Pro-X API responses

export interface ProxKeyInfo {
  id: string;
  maskedName: string;
}

export interface ProxStatus {
  name: string;
  key_masked: string;
  plan_type: string;
  balance: number | null;
  rate_limit_amount: number;
  rate_limit_interval_hours: number;
  rate_limit_window_spent: number;
  rate_limit_window_remaining: number;
  rate_limit_window_resets_at: string;
  total_spent: number;
  total_input_tokens: number;
  total_output_tokens: number;
  expiry: string;
  days_remaining: number;
  expired: boolean;
}

export interface ProxSummaryItem {
  model: string;
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost: number;
}

export interface ProxSummary {
  summary: ProxSummaryItem[];
  totals: {
    requests: number;
    input_tokens: number;
    output_tokens: number;
    cost: number;
  };
}

export interface ProxChartPoint {
  date: string;
  cost: number;
  input_tokens: number;
  output_tokens: number;
  requests: number;
}

export interface ProxChart {
  chart: ProxChartPoint[];
}

export interface ProxRecentLog {
  created_at: string;
  model_display: string;
  input_tokens: number;
  output_tokens: number;
  total_cost: number;
}

export interface ProxRecent {
  logs: ProxRecentLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}
