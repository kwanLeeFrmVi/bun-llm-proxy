import { getUsageStats, getUsageDetails } from "stubs/usageDb.ts";
import { getProviderConnections } from "db/index.ts";
import { CORS_HEADERS } from "lib/cors.ts";
import { register } from "lib/routeRegistry";

export async function POST(req: Request): Promise<Response> {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  const { key } = body;
  // In a real app, we would validate 'key' against our database or use it to identify the user.
  // For this replica, we'll return the dashboard data matching the claudible.io format.

  const stats = getUsageStats("24h");
  const { rows: recentUsage } = getUsageDetails({ limit: 50 });

  // Try to find the provider info
  const connections = await getProviderConnections({ provider: 'anthropic-compatible-cldb' });
  const conn = connections[0];

  const response = {
    valid: true,
    balance: 766.2933624999997, // Mocked to match user's screenshot
    status: "active",
    createdAt: conn?.createdAt || "2026-05-04T02:41:20Z",
    stats: {
      breakdownAvailableSince: null,
      cacheReadTokens: stats.totalPromptTokens * 0.1, // Mocked
      cacheWriteTokens: stats.totalPromptTokens * 0.2, // Mocked
      completionTokens: stats.totalCompletionTokens,
      inputTokensRaw: stats.totalPromptTokens,
      promptTokens: stats.totalPromptTokens,
      totalCost: stats.totalCost,
      totalRequests: stats.totalRequests
    },
    usage: recentUsage.map(u => ({
      id: u.id,
      model: u.model,
      promptTokens: u.promptTokens,
      completionTokens: u.completionTokens,
      cacheReadTokens: u.cachedTokens, // Assuming cachedTokens is read
      cacheWriteTokens: Math.floor(u.promptTokens * 0.3), // Mocked
      costUSD: u.cost,
      costInputUSD: u.cost * 0.4,
      costOutputUSD: u.cost * 0.6,
      costCacheReadUSD: 0,
      costCacheWriteUSD: 0,
      createdAt: u.timestamp,
      hasBreakdown: true
    })),
    accountType: "monthly",
    dailyQuota: 1000,
    subscriptionExpiresAt: "2026-05-31T16:59:59Z",
    subscriptionActive: true,
    userEmail: conn?.email || "thanvaquy1996@gmail.com",
    userName: "Quan Le Minh",
    analytics: {
      dailyUsage: [],
      modelBreakdown: stats.byModel.map(m => ({
        model: m.model,
        cost: m.cost,
        tokens: m.tokens,
        requests: m.requests
      })),
      daysRemaining: {
        runwayMinutes: 0,
        avgCostPerMinute: 0,
        totalActiveMinutes: 0,
        currentBalance: 766.2933624999997,
        daysRemaining: 0,
        avgDailyCost7d: 0,
        avgDailyCost30d: 0
      },
      tokenEfficiency: {
        avgTokensPerRequest: stats.totalRequests ? (stats.totalPromptTokens + stats.totalCompletionTokens) / stats.totalRequests : 0,
        avgInputTokens: stats.totalRequests ? stats.totalPromptTokens / stats.totalRequests : 0,
        avgOutputTokens: stats.totalRequests ? stats.totalCompletionTokens / stats.totalRequests : 0,
        inputOutputRatio: stats.totalCompletionTokens ? stats.totalPromptTokens / stats.totalCompletionTokens : 0,
        totalRequests: stats.totalRequests
      },
      hourlyDistribution: []
    }
  };

  return Response.json(response, { headers: CORS_HEADERS });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

register("/api/dashboard/lookup", { POST, OPTIONS });
