// TrollLLM (trollllm.xyz) API types

export interface TrollBilling {
  creditsUsed: number;
  credits: number;
  creditsNew: number;
  creditsNewUsed: number;
  tokensUserNew: number;
  refCredits: number;
  purchasedAt: string | null;
  expiresAt: string | null;
  purchasedAtNew: string | null;
  expiresAtNew: string | null;
  daysUntilExpiration: number | null;
  daysUntilExpirationNew: number | null;
  subscriptionDays: number;
  isExpiringSoon: boolean;
  isExpiringSoonNew: boolean;
  creditsBonus: number;
  creditsBonusUsed: number;
  creditsBonusExpiresAt: string | null;
  daysUntilExpirationBonus: number | null;
  isExpiringSoonBonus: boolean;
  purchasedAtBonus: string | null;
  creditPriority: "bonus_first" | string;
  tier: string;
  planDailyAllocation: number;
  planDailyUsed: number;
  planDailyResetDate: string;
  planStartedAt: string;
  planExpiresAt: string;
  dailyResetHour: number | null;
  dailyResetMinute: number | null;
}

export interface TrollUsageStatus {
  tier: string;
  concurrent: {
    used: number;
    limit: number;
    remaining: number;
  };
  rpm: {
    used: number;
    limit: number;
    remaining: number;
  };
}

export interface TrollSummary {
  totalCost: number;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  avgDurationMs: number;
  totalCachedTokens: number;
}

export interface TrollLogRow {
  id: string;
  model: string;
  upstream: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  cacheHitTokens: number;
  creditsCost: number;
  durationMs: number;
  isStream: boolean;
  latencyMs: number;
  statusCode: number;
  isSuccess: boolean;
  endpoint: string;
  discountLabel: string;
  errorMessage: string;
  createdAt: string;
}

export interface TrollLogs {
  requests: TrollLogRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  nextCursor: string;
  hasMore: boolean;
}

export interface TrollMe {
  username: string;
  creditsUsed: number;
  credits: number;
  creditsNew: number;
  creditsNewUsed: number;
  tokensUserNew: number;
  refCredits: number;
  role: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  purchasedAt: string | null;
  expiresAt: string | null;
  purchasedAtNew: string | null;
  expiresAtNew: string | null;
  discordId: string;
  migration: boolean;
  email: string;
  emailVerified: boolean;
  isNewUser: boolean;
  bonusEnabled: boolean;
  creditPriority: string;
  tier: string;
  planDailyAllocation: number;
  planDailyUsed: number;
  planDailyResetDate: string;
  planStartedAt: string;
  planExpiresAt: string;
  dailyResetHour: number | null;
  dailyResetMinute: number | null;
}

export interface TrollPromo {
  active: boolean;
  bonusPercent: number;
  endsAt: string | null;
}