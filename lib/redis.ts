// Redis client + distributed lock via Bun.redis
// Connection is lazy — only connects when first used.
// Falls back gracefully if REDIS_URL is not set or Redis is unreachable.

import * as log from "./logger.ts";

// ─── Connection ──────────────────────────────────────────────────────────────────

let redis: InstanceType<typeof Bun.RedisClient> | null = null;
let redisAvailable = true;

function getRedis(): InstanceType<typeof Bun.RedisClient> | null {
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
    // Bun.redis uses positional args: SET key value EX seconds NX
    const result = await client.set(lockKey, lockValue, "EX", String(ttlSeconds), "NX");

    if (result === "OK") {
      return async () => {
        try {
          // Only release if we still own the lock
          const current = await client.get(lockKey);
          if (current === lockValue) {
            await client.del(lockKey);
          }
        } catch { /* best effort */ }
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
