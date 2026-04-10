// Logger utility for bun-runtime
// Direct port of src/sse/utils/logger.js
// Enhanced with request context tracking

import type { LogContext } from "./requestContext.ts";
import { formatLogPrefix } from "./requestContext.ts";

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

// Backward-compatible signatures (old: tag, message, data)
export function debug(tag: string, message: string, data?: unknown): void;
export function debug(ctx: LogContext, tag: string, message: string, data?: unknown): void;
export function debug(ctxOrTag: LogContext | string, tagOrMsg: string, msgOrData?: string | unknown, data?: unknown): void {
  if (typeof ctxOrTag === "string") {
    // Old signature: debug(tag, message, data)
    if (LEVEL <= LOG_LEVELS.DEBUG) {
      console.log(formatLog(null, ctxOrTag, tagOrMsg as string, msgOrData as unknown));
    }
  } else {
    // New signature: debug(ctx, tag, message, data)
    if (LEVEL <= LOG_LEVELS.DEBUG) {
      console.log(formatLog(ctxOrTag, tagOrMsg, msgOrData as string, data));
    }
  }
}

export function info(tag: string, message: string, data?: unknown): void;
export function info(ctx: LogContext, tag: string, message: string, data?: unknown): void;
export function info(ctxOrTag: LogContext | string, tagOrMsg: string, msgOrData?: string | unknown, data?: unknown): void {
  if (typeof ctxOrTag === "string") {
    // Old signature: info(tag, message, data)
    if (LEVEL <= LOG_LEVELS.INFO) {
      console.log(`\x1b[36m${formatLogWithDelta(null, ctxOrTag, tagOrMsg as string, msgOrData as unknown)}\x1b[0m`);
    }
  } else {
    // New signature: info(ctx, tag, message, data)
    if (LEVEL <= LOG_LEVELS.INFO) {
      console.log(`\x1b[36m${formatLogWithDelta(ctxOrTag, tagOrMsg, msgOrData as string, data)}\x1b[0m`);
    }
  }
}

export function warn(tag: string, message: string, data?: unknown): void;
export function warn(ctx: LogContext, tag: string, message: string, data?: unknown): void;
export function warn(ctxOrTag: LogContext | string, tagOrMsg: string, msgOrData?: string | unknown, data?: unknown): void {
  if (typeof ctxOrTag === "string") {
    // Old signature: warn(tag, message, data)
    if (LEVEL <= LOG_LEVELS.WARN) {
      console.warn(`\x1b[33m${formatLogWithDelta(null, ctxOrTag, tagOrMsg as string, msgOrData as unknown)}\x1b[0m`);
    }
  } else {
    // New signature: warn(ctx, tag, message, data)
    if (LEVEL <= LOG_LEVELS.WARN) {
      console.warn(`\x1b[33m${formatLogWithDelta(ctxOrTag, tagOrMsg, msgOrData as string, data)}\x1b[0m`);
    }
  }
}

export function error(tag: string, message: string, data?: unknown): void;
export function error(ctx: LogContext, tag: string, message: string, data?: unknown): void;
export function error(ctxOrTag: LogContext | string, tagOrMsg: string, msgOrData?: string | unknown, data?: unknown): void {
  if (typeof ctxOrTag === "string") {
    // Old signature: error(tag, message, data)
    if (LEVEL <= LOG_LEVELS.ERROR) {
      console.log(`\x1b[31m[${formatTime()}] ❌ [${ctxOrTag}] ${tagOrMsg}${msgOrData !== undefined ? ` ${formatData(msgOrData)}` : ""}\x1b[0m`);
    }
  } else {
    // New signature: error(ctx, tag, message, data)
    if (LEVEL <= LOG_LEVELS.ERROR) {
      console.log(`\x1b[31m[${formatTime()}] ${formatLogPrefix(ctxOrTag)} ❌ [${tagOrMsg}] ${msgOrData as string}${data !== undefined ? ` ${formatData(data)}` : ""}\x1b[0m`);
    }
  }
}

// ─── Request lifecycle logging ───────────────────────────────────────────────

/**
 * Log incoming request start
 */
export function requestStart(method: string, path: string, extra?: unknown): void;
export function requestStart(ctx: LogContext, method: string, path: string, extra?: unknown): void;
export function requestStart(ctxOrMethod: LogContext | string, methodOrPath: string, pathOrExtra?: string | unknown, extra?: unknown): void {
  let ctx: LogContext = null;
  let method: string;
  let path: string;
  let data: unknown = undefined;

  if (typeof ctxOrMethod === "string") {
    // Old signature: requestStart(method, path, extra)
    method = ctxOrMethod;
    path = methodOrPath;
    data = pathOrExtra as unknown;
  } else {
    // New signature: requestStart(ctx, method, path, extra)
    ctx = ctxOrMethod;
    method = methodOrPath;
    path = pathOrExtra as string;
    data = extra;
  }

  const reqPrefix = formatLogPrefix(ctx);
  const dataStr = data ? ` ${formatData(data)}` : "";
  console.log(`\x1b[36m[${formatTime()}] ${reqPrefix} 📥 ${method} ${path}${dataStr}\x1b[0m`);
}

/**
 * Log request completion with status and duration
 */
export function response(status: number, duration: number, extra?: unknown): void;
export function response(ctx: LogContext, status: number, duration: number, extra?: unknown): void;
export function response(ctxOrStatus: LogContext | number, statusOrDuration: number, durationOrExtra?: number | unknown, extra?: unknown): void {
  let ctx: LogContext = null;
  let status: number;
  let duration: number;
  let data: unknown = undefined;

  if (typeof ctxOrStatus === "number") {
    // Old signature: response(status, duration, extra)
    status = ctxOrStatus;
    duration = statusOrDuration;
    data = durationOrExtra as unknown;
  } else {
    // New signature: response(ctx, status, duration, extra)
    ctx = ctxOrStatus;
    status = statusOrDuration;
    duration = durationOrExtra as number;
    data = extra;
  }

  const reqPrefix = formatLogPrefix(ctx);
  const icon = status < 400 ? "📤" : "💥";
  const dataStr = data ? ` ${formatData(data)}` : "";
  console.log(`[${formatTime()}] ${reqPrefix} ${icon} ${status} (${duration}ms)${dataStr}`);
}

// ─── Stage-specific logging ───────────────────────────────────────────────────

/**
 * Log stream event
 */
export function stream(event: string, data?: unknown): void;
export function stream(ctx: LogContext, event: string, data?: unknown): void;
export function stream(ctxOrEvent: LogContext | string, eventOrData?: string | unknown, data?: unknown): void {
  let ctx: LogContext = null;
  let event: string;
  let eventData: unknown = undefined;

  if (typeof ctxOrEvent === "string") {
    // Old signature: stream(event, data)
    event = ctxOrEvent;
    eventData = eventOrData as unknown;
  } else {
    // New signature: stream(ctx, event, data)
    ctx = ctxOrEvent;
    event = eventOrData as string;
    eventData = data;
  }

  const reqPrefix = formatLogPrefix(ctx);
  const dataStr = eventData ? ` ${formatData(eventData)}` : "";

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
export function pending(provider: string, model: string): void;
export function pending(ctx: LogContext, provider: string, model: string): void;
export function pending(ctxOrProvider: LogContext | string, providerOrModel: string, model?: string): void {
  let ctx: LogContext = null;
  let provider: string;
  let mod: string;

  if (typeof ctxOrProvider === "string") {
    // Old signature: pending(provider, model)
    provider = ctxOrProvider;
    mod = providerOrModel;
  } else {
    // New signature: pending(ctx, provider, model)
    ctx = ctxOrProvider;
    provider = providerOrModel;
    mod = model!;
  }

  const reqPrefix = formatLogPrefix(ctx);
  // Import dynamically to avoid circular dependency
  import("./providers.ts").then(({ getProviderDisplayName }) => {
    getProviderDisplayName(provider).then(providerName => {
      console.log(`[${formatTime()}] ${reqPrefix} ⏳ [PENDING] provider=${providerName} | model=${mod}`);
    });
  });
}

/**
 * Log format detection
 */
export function formatDetect(from: string, to: string, stream: boolean): void;
export function formatDetect(ctx: LogContext, from: string, to: string, stream: boolean): void;
export function formatDetect(ctxOrFrom: LogContext | string, fromOrTo: string, toOrStream?: string | boolean, stream?: boolean): void {
  let ctx: LogContext = null;
  let from: string;
  let to: string;
  let strm: boolean;

  if (typeof ctxOrFrom === "string") {
    // Old signature: formatDetect(from, to, stream)
    from = ctxOrFrom;
    to = fromOrTo;
    strm = toOrStream as boolean;
  } else {
    // New signature: formatDetect(ctx, from, to, stream)
    ctx = ctxOrFrom;
    from = fromOrTo;
    to = toOrStream as string;
    strm = stream!;
  }

  const reqPrefix = formatLogPrefix(ctx);
  console.log(`[${formatTime()}] ${reqPrefix} 🔍 [FORMAT] ${from} → ${to} | stream=${strm}`);
}

/**
 * Log passthrough mode
 */
export function passthrough(from: string, to: string, mode: string): void;
export function passthrough(ctx: LogContext, from: string, to: string, mode: string): void;
export function passthrough(ctxOrFrom: LogContext | string, fromOrTo: string, toOrMode?: string, mode?: string): void {
  let ctx: LogContext = null;
  let from: string;
  let to: string;
  let md: string;

  if (typeof ctxOrFrom === "string") {
    // Old signature: passthrough(from, to, mode)
    from = ctxOrFrom;
    to = fromOrTo;
    md = toOrMode!;
  } else {
    // New signature: passthrough(ctx, from, to, mode)
    ctx = ctxOrFrom;
    from = fromOrTo;
    to = toOrMode!;
    md = mode!;
  }

  const reqPrefix = formatLogPrefix(ctx);
  console.log(`[${formatTime()}] ${reqPrefix} 🔍 [PROXY] Passthrough: ${from} → ${to} | ${md}`);
}

/**
 * Log upstream request
 */
export function upstream(method: string, url: string, extra?: string): void;
export function upstream(ctx: LogContext, method: string, url: string, extra?: string): void;
export function upstream(ctxOrMethod: LogContext | string, methodOrUrl: string, urlOrExtra?: string | undefined, extra?: string): void {
  let ctx: LogContext = null;
  let method: string;
  let url: string;
  let ext: string | undefined = undefined;

  if (typeof ctxOrMethod === "string") {
    // Old signature: upstream(method, url, extra)
    method = ctxOrMethod;
    url = methodOrUrl;
    ext = urlOrExtra as string | undefined;
  } else {
    // New signature: upstream(ctx, method, url, extra)
    ctx = ctxOrMethod;
    method = methodOrUrl;
    url = urlOrExtra!;
    ext = extra;
  }

  const reqPrefix = formatLogPrefix(ctx);
  const extraStr = ext ? ` | ${ext}` : "";
  console.log(`[${formatTime()}] ${reqPrefix} 🔍 [UPSTREAM] ${method} ${url}${extraStr}`);
}

// ─── Legacy functions for backward compatibility ───────────────────────────────

/**
 * @deprecated Use requestStart instead
 */
export function request(method: string, path: string, extra?: unknown): void {
  requestStart(method, path, extra);
}

// ─── Utility functions ────────────────────────────────────────────────────────

export function maskKey(key: string): string {
  if (!key || key.length < 8) return "***";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

// Re-export RequestContext types for convenience
export type { LogContext } from "./requestContext.ts";
export { RequestContext, getRequestId, formatLogPrefix } from "./requestContext.ts";
