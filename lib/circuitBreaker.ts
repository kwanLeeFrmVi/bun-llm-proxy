// Redis-backed per-account transient error circuit breaker.
// Falls back to in-memory Map if Redis is unavailable.

import { withLock, getRedis } from "./redis.ts";
import { TRANSIENT_RETRY } from "../ai-bridge/config/runtimeConfig.ts";
import * as log from "./logger.ts";

const CIRCUIT_PREFIX = "circuit:";
const CIRCUIT_TTL_SEC = 30; // matches COOLDOWN_MS.transient (30s)

// In-memory fallback when Redis is unavailable
const inMemoryCircuit = new Map<string, { count: number; expiresAt: number }>();

function makeKey(connectionId: string, model: string): string {
  return `${CIRCUIT_PREFIX}${connectionId}:${model}`;
}

// ─── Check if circuit is open ────────────────────────────────────────────────

/**
 * Returns true if the circuit is open (failure count >= maxAttempts).
 */
export async function isCircuitOpen(
  connectionId: string,
  model: string
): Promise<boolean> {
  const key = makeKey(connectionId, model);

  // Try Redis first
  const redis = getRedis();
  if (redis) {
    try {
      const val = await redis.get(key);
      if (val !== null) {
        const count = parseInt(val as string, 10);
        return count >= TRANSIENT_RETRY.maxAttempts;
      }
    } catch (err) {
      log.debug(null, "CIRCUIT", `Redis get error for ${key}: ${(err as Error).message}`);
    }
    return false;
  }

  // Fallback: in-memory
  const entry = inMemoryCircuit.get(key);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    inMemoryCircuit.delete(key);
    return false;
  }
  return entry.count >= TRANSIENT_RETRY.maxAttempts;
}

// ─── Increment failure counter ───────────────────────────────────────────────

/**
 * Atomically increment the failure counter for a (connectionId, model).
 * Returns the new count after incrementing.
 */
export async function incrementCircuitBreaker(
  connectionId: string,
  model: string
): Promise<number> {
  const key = makeKey(connectionId, model);

  // Redis: INCR then EXPIRE atomically via withLock
  const redis = getRedis();
  if (redis) {
    try {
      const result = await withLock(
        `circuit-lock:${connectionId}:${model}`,
        2,
        async () => {
          const count = await redis.incr(key);
          await redis.expire(key, CIRCUIT_TTL_SEC);
          return count;
        }
      );
      if (result.executed) return result.result ?? 1;
    } catch (err) {
      log.debug(null, "CIRCUIT", `Redis lock error for ${key}: ${(err as Error).message}`);
    }
  }

  // Fallback: in-memory
  const now = Date.now();
  const entry = inMemoryCircuit.get(key);
  const current =
    entry && Date.now() <= entry.expiresAt ? entry.count : 0;
  const next = current + 1;
  inMemoryCircuit.set(key, {
    count: next,
    expiresAt: now + CIRCUIT_TTL_SEC * 1000,
  });
  log.debug(null, "CIRCUIT", `in-memory circuit increment: ${key} → ${next}`);
  return next;
}

// ─── Reset on success ────────────────────────────────────────────────────────

/**
 * Clear the circuit breaker counter on a successful response.
 */
export async function resetCircuitBreaker(
  connectionId: string,
  model: string
): Promise<void> {
  const key = makeKey(connectionId, model);
  const redis = getRedis();
  if (redis) {
    try {
      await redis.del(key);
    } catch (err) {
      log.debug(null, "CIRCUIT", `Redis del error for ${key}: ${(err as Error).message}`);
    }
  } else {
    inMemoryCircuit.delete(key);
  }
}
