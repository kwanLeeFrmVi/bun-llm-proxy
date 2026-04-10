// Singleton cache for real Claude Code client headers.
// Captures headers from authentic Claude Code requests and makes them available
// for forwarding to api.anthropic.com, replacing static hardcoded values.
//
// Memory Management:
// - TTL: Headers expire after CACHE_TTL_MS (default 1 hour)
// - Size limit: Maximum MAX_CACHE_SIZE entries (default 100)
// - LRU eviction: Least recently used entries are evicted when limit is reached
// - Periodic cleanup: Expired entries are removed every CLEANUP_INTERVAL_MS (default 5 minutes)

const CLAUDE_IDENTITY_HEADERS = [
  "user-agent",
  "anthropic-beta",
  "anthropic-version",
  "anthropic-dangerous-direct-browser-access",
  "x-app",
  "x-stainless-helper-method",
  "x-stainless-retry-count",
  "x-stainless-runtime-version",
  "x-stainless-package-version",
  "x-stainless-runtime",
  "x-stainless-lang",
  "x-stainless-arch",
  "x-stainless-os",
  "x-stainless-timeout",
  "x-claude-code-session-id",
  "package-version",
  "runtime-version",
  "os",
  "arch",
];

// Cache configuration
const CACHE_TTL_MS = 60 * 60 * 1000 * 12; // 12 hours
const MAX_CACHE_SIZE = 100; // Maximum number of cached header sets
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  headers: Record<string, string>;
  timestamp: number;
  accessCount: number;
  lastAccess: number;
}

// Cache storage: key = session identifier (x-claude-code-session-id or user-agent hash)
const headerCache = new Map<string, CacheEntry>();

// Cleanup interval reference
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function isClaudeCodeClient(headers: Record<string, string>): boolean {
  const ua = (headers["user-agent"] || "").toLowerCase();
  const xApp = (headers["x-app"] || "").toLowerCase();
  return ua.includes("claude-cli") || ua.includes("claude-code") || xApp === "cli";
}

function generateCacheKey(headers: Record<string, string>): string {
  // Use session ID if available, otherwise hash the user-agent
  const sessionId = headers["x-claude-code-session-id"];
  if (sessionId) {
    return `session:${sessionId}`;
  }

  // Fallback to user-agent as key
  const userAgent = headers["user-agent"] || "unknown";
  return `ua:${userAgent}`;
}

function performCleanup(): void {
  const now = Date.now();
  let cleaned = 0;

  // Remove expired entries
  for (const [key, entry] of headerCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      headerCache.delete(key);
      cleaned++;
    }
  }

  // If still over limit, remove least recently used entries
  if (headerCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(headerCache.entries())
      .sort((a, b) => a[1].lastAccess - b[1].lastAccess);

    const toRemove = entries.slice(0, headerCache.size - MAX_CACHE_SIZE);
    for (const [key] of toRemove) {
      headerCache.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[ClaudeHeaders] Cleaned up ${cleaned} expired cache entries, ${headerCache.size} active`);
  }
}

function startCleanupTimer(): void {
  if (cleanupInterval) return; // Already running

  cleanupInterval = setInterval(() => {
    performCleanup();
  }, CLEANUP_INTERVAL_MS);

  // Don't keep the process alive just for this timer
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }
}

export function cacheClaudeHeaders(
  headers: Record<string, string>
): void {
  if (!headers || typeof headers !== "object") return;
  if (!isClaudeCodeClient(headers)) return;

  const captured: Record<string, string> = {};
  for (const key of CLAUDE_IDENTITY_HEADERS) {
    if (headers[key] !== undefined && headers[key] !== null) {
      captured[key] = headers[key];
    }
  }

  if (Object.keys(captured).length > 0) {
    const cacheKey = generateCacheKey(headers);
    const now = Date.now();

    const entry: CacheEntry = {
      headers: captured,
      timestamp: now,
      accessCount: 0,
      lastAccess: now,
    };

    headerCache.set(cacheKey, entry);

    // Start cleanup timer on first cache entry
    if (headerCache.size === 1) {
      startCleanupTimer();
    }

    console.log(`[ClaudeHeaders] Cached ${Object.keys(captured).length} identity headers from Claude Code client (key: ${cacheKey}, total: ${headerCache.size}/${MAX_CACHE_SIZE})`);
  }
}

export function getCachedClaudeHeaders(): Record<string, string> | null {
  // If cache is empty, return null
  if (headerCache.size === 0) {
    return null;
  }

  // Get the most recently used entry
  // Sort by lastAccess, then by timestamp (creation time) as a tiebreaker
  const entries = Array.from(headerCache.values())
    .sort((a, b) => {
      if (b.lastAccess !== a.lastAccess) {
        return b.lastAccess - a.lastAccess;
      }
      // If lastAccess is the same, use timestamp (most recently created wins)
      return b.timestamp - a.timestamp;
    });

  if (entries.length === 0) {
    return null;
  }

  // Update access statistics
  const mostRecent = entries[0];
  if (!mostRecent) {
    return null;
  }

  mostRecent.accessCount++;
  mostRecent.lastAccess = Date.now();

  return mostRecent.headers;
}

/**
 * Clear all cached headers. Primarily used for testing.
 */
export function clearCachedClaudeHeaders(): void {
  headerCache.clear();
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  console.log("[ClaudeHeaders] Cache cleared");
}

/**
 * Get cache statistics for monitoring
 */
export function getCacheStats(): {
  size: number;
  maxSize: number;
  ttlMs: number;
  entries: Array<{
    key: string;
    age: number;
    accessCount: number;
    headerCount: number;
  }>;
} {
  const now = Date.now();
  const entries = Array.from(headerCache.entries()).map(([key, entry]) => ({
    key,
    age: now - entry.timestamp,
    accessCount: entry.accessCount,
    headerCount: Object.keys(entry.headers).length,
  }));

  return {
    size: headerCache.size,
    maxSize: MAX_CACHE_SIZE,
    ttlMs: CACHE_TTL_MS,
    entries,
  };
}