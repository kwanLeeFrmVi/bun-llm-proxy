// Request context tracking for correlating logs across the request flow

const contextMap = new Map<string, RequestContext>();

/**
 * Generate a short 6-character random ID for request tracking
 */
function generateRequestId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export class RequestContext {
  readonly id: string;
  readonly startTime: number;
  model?: string;
  provider?: string;
  stage: string = "init";
  private lastMark: number;

  constructor(id: string) {
    this.id = id;
    this.startTime = Date.now();
    this.lastMark = this.startTime;
  }

  /**
   * Get elapsed time since request start
   */
  get elapsed(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Get elapsed time since last mark and update the mark
   */
  mark(): number {
    const now = Date.now();
    const delta = now - this.lastMark;
    this.lastMark = now;
    return delta;
  }

  /**
   * Format a duration in ms as a human-readable string
   */
  static formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  /**
   * Create a new request context
   */
  static create(): RequestContext {
    const id = generateRequestId();
    const ctx = new RequestContext(id);
    contextMap.set(id, ctx);
    return ctx;
  }

  /**
   * Get an existing request context by ID
   */
  static get(id: string): RequestContext | undefined {
    return contextMap.get(id);
  }

  /**
   * Delete a request context (cleanup)
   */
  static delete(id: string): void {
    contextMap.delete(id);
  }

  /**
   * Get summary string for logging
   */
  get summary(): string {
    const elapsedStr = RequestContext.formatDuration(this.elapsed);
    return `${this.id} | ${elapsedStr}`;
  }
}

// Type for logger that includes requestId
export type LogContext = RequestContext | string | null | undefined;

/**
 * Extract request ID from context
 */
export function getRequestId(ctx: LogContext): string | null {
  if (!ctx) return null;
  if (typeof ctx === "string") return ctx;
  return ctx.id;
}

/**
 * Format log prefix with request ID
 */
export function formatLogPrefix(ctx: LogContext): string {
  const id = getRequestId(ctx);
  return id ? `[req:${id}]` : "";
}
