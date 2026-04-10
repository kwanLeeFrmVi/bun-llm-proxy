// Logger utility for bun-runtime
// Direct port of src/sse/utils/logger.js
// Enhanced with request context tracking

import type { LogContext } from "./requestContext.ts";
import type { RequestContext as RequestContextType } from "./requestContext.ts";
import { getRequestId, formatLogPrefix } from "./requestContext.ts";

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const LEVEL = LOG_LEVELS.DEBUG;

// Milestone tags that show timing deltas
const MILESTONE_TAGS = new Set(["AUTH", "ROUTING", "PROXY"]);

function formatTime(): string {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

function formatData(data: unknown): string {
  if (!data) return "";
  if (typeof data === "string") return data;
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

/**
 * Format log with optional request context
 */
function formatLog(ctx: LogContext, tag: string, message: string, data?: unknown): string {
  const reqPrefix = formatLogPrefix(ctx);
  const dataStr = data ? ` ${formatData(data)}` : "";
  return `[${formatTime()}] ${reqPrefix} [${tag}] ${message}${dataStr}`;
}

/**
 * Format log with timing delta for milestone tags
 */
function formatLogWithDelta(
  ctx: LogContext,
  tag: string,
  message: string,
  data?: unknown
): string {
  const reqPrefix = formatLogPrefix(ctx);
  const dataStr = data ? ` ${formatData(data)}` : "";

  // Add timing delta for milestone tags
  let deltaStr = "";
  if (MILESTONE_TAGS.has(tag) && ctx && typeof ctx !== "string") {
    const delta = ctx.mark();
    deltaStr = ` | +${delta}ms`;
  }

  return `[${formatTime()}] ${reqPrefix} [${tag}] ${message}${dataStr}${deltaStr}`;
}

// ─── Request-aware logging functions ───────────────────────────────────────

export function debug(ctx: LogContext, tag: string, message: string, data?: unknown): void {
  if (LEVEL <= LOG_LEVELS.DEBUG) {
    console.log(formatLog(ctx, tag, message, data));
  }
}

export function info(ctx: LogContext, tag: string, message: string, data?: unknown): void {
  if (LEVEL <= LOG_LEVELS.INFO) {
    console.log(`\x1b[36m${formatLogWithDelta(ctx, tag, message, data)}\x1b[0m`);
  }
}

export function warn(ctx: LogContext, tag: string, message: string, data?: unknown): void {
  if (LEVEL <= LOG_LEVELS.WARN) {
    console.warn(`\x1b[33m${formatLogWithDelta(ctx, tag, message, data)}\x1b[0m`);
  }
}

export function error(ctx: LogContext, tag: string, message: string, data?: unknown): void {
  if (LEVEL <= LOG_LEVELS.ERROR) {
    console.log(`\x1b[31m[${formatTime()}] ${formatLogPrefix(ctx)} ❌ [${tag}] ${message}${data ? ` ${formatData(data)}` : ""}\x1b[0m`);
  }
}

// ─── Request lifecycle logging ───────────────────────────────────────────────

/**
 * Log incoming request start
 */
export function requestStart(
  ctx: LogContext,
  method: string,
  path: string,
  extra?: unknown
): void {
  const reqPrefix = formatLogPrefix(ctx);
  const dataStr = extra ? ` ${formatData(extra)}` : "";
  console.log(`\x1b[36m[${formatTime()}] ${reqPrefix} 📥 ${method} ${path}${dataStr}\x1b[0m`);
}

/**
 * Log request completion with status and duration
 */
export function requestEnd(
  ctx: LogContext,
  status: number,
  duration: number,
  extra?: unknown
): void {
  const reqPrefix = formatLogPrefix(ctx);
  const icon = status < 400 ? "📤" : "💥";
  const dataStr = extra ? ` ${formatData(extra)}` : "";
  console.log(`[${formatTime()}] ${reqPrefix} ${icon} ${status} (${duration}ms)${dataStr}`);
}

// ─── Stage-specific logging ───────────────────────────────────────────────────

/**
 * Log stream event
 */
export function stream(
  ctx: LogContext,
  event: string,
  data?: unknown
): void {
  const reqPrefix = formatLogPrefix(ctx);
  const dataStr = data ? ` ${formatData(data)}` : "";

  // For COMPLETE event, add total duration
  let durationStr = "";
  if (event === "COMPLETE" && ctx && typeof ctx !== "string") {
    const elapsed = ctx.elapsed;
    durationStr = ` | ${(elapsed >= 1000 ? (elapsed / 1000).toFixed(1) + "s" : elapsed + "ms")}`;
  }

  const icon = event === "COMPLETE" ? "✅" : "🌊";
  console.log(`[${formatTime()}] ${reqPrefix} ${icon} [STREAM] ${event}${dataStr}${durationStr}`);
}

/**
 * Log pending request start (provider/model selection)
 */
export function pending(ctx: LogContext, provider: string, model: string): void {
  const reqPrefix = formatLogPrefix(ctx);
  // Import dynamically to avoid circular dependency
  import("./providers.ts").then(({ getProviderDisplayName }) => {
    getProviderDisplayName(provider).then(providerName => {
      console.log(`[${formatTime()}] ${reqPrefix} ⏳ [PENDING] provider=${providerName} | model=${model}`);
    });
  });
}

/**
 * Log format detection
 */
export function formatDetect(ctx: LogContext, from: string, to: string, stream: boolean): void {
  const reqPrefix = formatLogPrefix(ctx);
  console.log(`[${formatTime()}] ${reqPrefix} 🔍 [FORMAT] ${from} → ${to} | stream=${stream}`);
}

/**
 * Log passthrough mode
 */
export function passthrough(ctx: LogContext, from: string, to: string, mode: string): void {
  const reqPrefix = formatLogPrefix(ctx);
  console.log(`[${formatTime()}] ${reqPrefix} 🔍 [PROXY] Passthrough: ${from} → ${to} | ${mode}`);
}

/**
 * Log upstream request
 */
export function upstream(ctx: LogContext, method: string, url: string, extra?: string): void {
  const reqPrefix = formatLogPrefix(ctx);
  const extraStr = extra ? ` | ${extra}` : "";
  console.log(`[${formatTime()}] ${reqPrefix} 🔍 [UPSTREAM] ${method} ${url}${extraStr}`);
}

// ─── Utility functions ────────────────────────────────────────────────────────

export function maskKey(key: string): string {
  if (!key || key.length < 8) return "***";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

// Re-export RequestContext types for convenience
export type { RequestContext as RequestContextType, LogContext } from "./requestContext.ts";
export { RequestContext, getRequestId, formatLogPrefix } from "./requestContext.ts";
