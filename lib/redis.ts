// Redis client + distributed lock via Bun.redis
// Connection is lazy — only connects when first used.
// Falls back gracefully if REDIS_URL is not set or Redis is unreachable.

import * as log from "./logger.ts";

// ─── TTL Constants ───────────────────────────────────────────────────────────────

const TTL_24HOURS = 86400; // 24 hours in seconds
const TTL_48HOURS = 48 * 3600; // 48 hours in seconds
const TTL_VERTEX_TOKEN_MIN = 60; // minimum 60 seconds for vertex token
const TTL_VERTEX_TOKEN_BUFFER = 300; // 5-minute buffer for vertex token

// ─── Connection ──────────────────────────────────────────────────────────────────

let redis: InstanceType<typeof Bun.RedisClient> | null = null;
let redisAvailable = true;

export function getRedis(): InstanceType<typeof Bun.RedisClient> | null {
  if (!redisAvailable) return null;

  if (!redis) {
    const url = process.env.REDIS_URL;
    if (!url) {
      redisAvailable = false;
      log.info("REDIS", "REDIS_URL not set — Redis features disabled");
      return null;
    }
    try {
      redis = new Bun.RedisClient(url);
      log.info("REDIS", "Connected to Redis");
    } catch (err) {
      redisAvailable = false;
      log.error("REDIS", `Failed to connect: ${(err as Error).message}`);
      return null;
    }
  }
  return redis;
}

export function isRedisAvailable(): boolean {
  return getRedis() !== null;
}

// ─── Distributed Lock ────────────────────────────────────────────────────────────

const LOCK_PREFIX = "lock:";

/**
 * Acquire a distributed lock using Redis SET key value EX ttl NX.
 * Returns a release function if acquired, or null if not.
 */
export async function acquireLock(
  key: string,
  ttlSeconds: number
): Promise<(() => Promise<void>) | null> {
  const client = getRedis();
  if (!client) return null;

  const lockKey = `${LOCK_PREFIX}${key}`;
  const lockValue = `${process.pid}:${Date.now()}`;

  try {
    // Bun.redis uses positional args: SET key value EX seconds NX !note: this is different from redis-cli with this method override ttlSeconds need to be in string
    const result = await client.set(lockKey, lockValue, "EX", String(ttlSeconds), "NX");

    if (result === "OK") {
      return async () => {
        try {
          // Only release if we still own the lock
          const current = await client.get(lockKey);
          if (current === lockValue) {
            await client.del(lockKey);
          }
        } catch {
          /* best effort */
        }
      };
    }
    return null;
  } catch (err) {
    log.debug("REDIS", `Lock acquire error for ${key}: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Try to acquire lock. If acquired, run fn and release. If not, skip.
 * Returns true if fn was executed, false if lock was not acquired.
 * If Redis is unavailable, fn runs unconditionally (fallback).
 */
export async function withLock<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<{ executed: boolean; result?: T }> {
  const release = await acquireLock(key, ttlSeconds);

  if (release === null && isRedisAvailable()) {
    // Redis is available but lock is held by another instance
    return { executed: false };
  }

  // Either we got the lock, or Redis is unavailable (run anyway as fallback)
  try {
    const result = await fn();
    return { executed: true, result };
  } finally {
    if (release) await release();
  }
}

// ─── Combo Routing helpers ────────────────────────────────────────────────────

const SESSION_PREFIX = "session:";
const SESSION_COUNTER_PREFIX = "session-counter:";
const RR_PREFIX = "rr:";
const SPEED_PREFIX = "speed:";

/**
 * Get the model assigned to a session for a given combo.
 * Returns null if no assignment exists or if Redis is unavailable.
 */
export async function getSessionModel(
  comboName: string,
  sessionId: string
): Promise<{ model: string; assignedAt: number } | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    const raw = await client.get(`${SESSION_PREFIX}${comboName}:${sessionId}`);
    if (!raw) return null;
    return JSON.parse(raw) as { model: string; assignedAt: number };
  } catch (err) {
    log.debug(
      "REDIS",
      `getSessionModel error for ${comboName}:${sessionId}: ${(err as Error).message}`
    );
    return null;
  }
}

/**
 * Set the model assigned to a session for a given combo.
 * TTL defaults to 24 hours (86400 seconds).
 */
export async function setSessionModel(
  comboName: string,
  sessionId: string,
  model: string,
  ttlSeconds = TTL_24HOURS
): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    const value = JSON.stringify({ model, assignedAt: Date.now() });
    await client.set(`${SESSION_PREFIX}${comboName}:${sessionId}`, value, "EX", ttlSeconds);
  } catch (err) {
    log.debug(
      "REDIS",
      `setSessionModel error for ${comboName}:${sessionId}: ${(err as Error).message}`
    );
  }
}

/**
 * Atomically increment and return the session assignment counter for a combo.
 * Used for round-robin assignment of new sessions across models.
 * Returns -1 if Redis is unavailable.
 */
export async function incrementSessionCounter(comboName: string): Promise<number> {
  const client = getRedis();
  if (!client) return -1;
  try {
    const key = `${SESSION_COUNTER_PREFIX}${comboName}`;
    const val = await client.incr(key);
    // Set a 48h TTL on the counter so it doesn't linger forever
    if (val === 1) {
      await client.expire(key, TTL_48HOURS);
    }
    return val - 1; // return 0-based index
  } catch (err) {
    log.debug("REDIS", `incrementSessionCounter error for ${comboName}: ${(err as Error).message}`);
    return -1;
  }
}

/**
 * Get round-robin state for a combo.
 * Returns null if Redis is unavailable or no state exists.
 */
export async function getRRState(
  comboName: string
): Promise<{ index: number; stickyCount: number } | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    const raw = await client.get(`${RR_PREFIX}${comboName}`);
    if (!raw) return null;
    return JSON.parse(raw) as { index: number; stickyCount: number };
  } catch (err) {
    log.debug("REDIS", `getRRState error for ${comboName}: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Set round-robin state for a combo.
 * TTL of 48 hours so stale state doesn't linger.
 */
export async function setRRState(
  comboName: string,
  state: { index: number; stickyCount: number }
): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.set(`${RR_PREFIX}${comboName}`, JSON.stringify(state), "EX", TTL_48HOURS);
  } catch (err) {
    log.debug("REDIS", `setRRState error for ${comboName}: ${(err as Error).message}`);
  }
}

/**
 * Get speed strategy state for a combo.
 * Returns null if Redis is unavailable or no state exists.
 */
export async function getSpeedState(
  comboName: string
): Promise<{ model: string; count: number } | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    const raw = await client.get(`${SPEED_PREFIX}${comboName}`);
    if (!raw) return null;
    return JSON.parse(raw) as { model: string; count: number };
  } catch (err) {
    log.debug("REDIS", `getSpeedState error for ${comboName}: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Set speed strategy state for a combo.
 * TTL of 48 hours so stale state doesn't linger.
 */
export async function setSpeedState(
  comboName: string,
  state: { model: string; count: number }
): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.set(`${SPEED_PREFIX}${comboName}`, JSON.stringify(state), "EX", TTL_48HOURS);
  } catch (err) {
    log.debug("REDIS", `setSpeedState error for ${comboName}: ${(err as Error).message}`);
  }
}

// ─── Vertex Token Cache helpers ──────────────────────────────────────────────

const VERTEX_TOKEN_PREFIX = "vertex-token:";

/**
 * Get cached Vertex AI OAuth token for a service account email.
 * Returns null if Redis is unavailable or no cached token exists.
 */
export async function getVertexToken(
  clientEmail: string
): Promise<{ token: string; expiresAt: number } | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    const raw = await client.get(`${VERTEX_TOKEN_PREFIX}${clientEmail}`);
    if (!raw) return null;
    return JSON.parse(raw) as { token: string; expiresAt: number };
  } catch (err) {
    log.debug("REDIS", `getVertexToken error for ${clientEmail}: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Cache a Vertex AI OAuth token. TTL is set to the token's remaining lifetime
 * minus a 5-minute buffer, with a minimum of 60 seconds.
 */
export async function setVertexToken(
  clientEmail: string,
  token: string,
  expiresAt: number
): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    const ttlSec = Math.max(
      TTL_VERTEX_TOKEN_MIN,
      Math.floor((expiresAt - Date.now()) / 1000) - TTL_VERTEX_TOKEN_BUFFER
    );
    await client.set(
      `${VERTEX_TOKEN_PREFIX}${clientEmail}`,
      JSON.stringify({ token, expiresAt }),
      "EX",
      ttlSec
    );
  } catch (err) {
    log.debug("REDIS", `setVertexToken error for ${clientEmail}: ${(err as Error).message}`);
  }
}

// ─── Claude Header Cache helpers ──────────────────────────────────────────────

const CLAUDE_HEADER_PREFIX = "claude-headers:";

/**
 * Get cached Claude headers for a given cache key (session ID or user-agent hash).
 * Returns null if Redis is unavailable or no cached headers exist.
 */
export async function getCachedClaudeHeadersRedis(
  cacheKey: string
): Promise<{ headers: Record<string, string>; timestamp: number; lastAccess: number } | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    const raw = await client.get(`${CLAUDE_HEADER_PREFIX}${cacheKey}`);
    if (!raw) return null;
    return JSON.parse(raw) as {
      headers: Record<string, string>;
      timestamp: number;
      lastAccess: number;
    };
  } catch (err) {
    log.debug(
      "REDIS",
      `getCachedClaudeHeadersRedis error for ${cacheKey}: ${(err as Error).message}`
    );
    return null;
  }
}

/**
 * Cache Claude headers for a given cache key. TTL defaults to 24 hours.
 */
export async function setCachedClaudeHeadersRedis(
  cacheKey: string,
  headers: Record<string, string>,
  ttlSeconds = TTL_24HOURS
): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    const now = Date.now();
    await client.set(
      `${CLAUDE_HEADER_PREFIX}${cacheKey}`,
      JSON.stringify({ headers, timestamp: now, lastAccess: now }),
      "EX",
      ttlSeconds
    );
  } catch (err) {
    log.debug(
      "REDIS",
      `setCachedClaudeHeadersRedis error for ${cacheKey}: ${(err as Error).message}`
    );
  }
}

/**
 * Update the lastAccess timestamp for a cached Claude header entry.
 */
export async function touchCachedClaudeHeadersRedis(cacheKey: string): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    const existing = await getCachedClaudeHeadersRedis(cacheKey);
    if (existing) {
      await client.set(
        `${CLAUDE_HEADER_PREFIX}${cacheKey}`,
        JSON.stringify({ ...existing, lastAccess: Date.now() }),
        "EX",
        TTL_24HOURS // reset TTL on access
      );
    }
  } catch (err) {
    log.debug(
      "REDIS",
      `touchCachedClaudeHeadersRedis error for ${cacheKey}: ${(err as Error).message}`
    );
  }
}

// ─── OAuth Pending Flow helpers ───────────────────────────────────────────────────

const OAUTH_PENDING_PREFIX = "oauth:pending:";

export interface PendingOAuthFlow {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * Store pending OAuth flow data with 5-minute expiration.
 */
export async function storePendingFlow(
  state: string,
  data: Omit<PendingOAuthFlow, "state">
): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    const key = `${OAUTH_PENDING_PREFIX}${state}`;
    await client.set(key, JSON.stringify({ state, ...data }), "EX", 300); // 5 minutes
  } catch (err) {
    log.debug("REDIS", `storePendingFlow error for ${state}: ${(err as Error).message}`);
  }
}

/**
 * Retrieve pending OAuth flow data by state.
 */
export async function getPendingFlow(state: string): Promise<PendingOAuthFlow | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    const key = `${OAUTH_PENDING_PREFIX}${state}`;
    const raw = await client.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as PendingOAuthFlow;
  } catch (err) {
    log.debug("REDIS", `getPendingFlow error for ${state}: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Delete pending OAuth flow data after successful exchange.
 */
export async function deletePendingFlow(state: string): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    const key = `${OAUTH_PENDING_PREFIX}${state}`;
    await client.del(key);
  } catch (err) {
    log.debug("REDIS", `deletePendingFlow error for ${state}: ${(err as Error).message}`);
  }
}

// ─── Cache helpers ──────────────────────────────────────────────────────────────

const CACHE_PREFIX = "cache:";

/**
 * Get a cached string value.
 */
export async function getRedisCache(key: string): Promise<string | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    return await client.get(`${CACHE_PREFIX}${key}`);
  } catch (err) {
    log.debug("REDIS", `get error for ${key}: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Set a cached string value with optional TTL (in seconds).
 */
export async function setRedisCache(
  key: string,
  value: string,
  ttlSeconds?: number
): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    if (ttlSeconds) {
      await client.set(`${CACHE_PREFIX}${key}`, value, "EX", ttlSeconds);
    } else {
      await client.set(`${CACHE_PREFIX}${key}`, value);
    }
  } catch (err) {
    log.debug("REDIS", `set error for ${key}: ${(err as Error).message}`);
  }
}
