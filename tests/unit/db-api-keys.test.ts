/**
 * Unit tests for database API key operations (db/index.ts)
 * Tests create, read, update, delete, and user assignment flows.
 * Uses an in-memory SQLite database to avoid side effects.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  createApiKey,
  getApiKeyById,
  getApiKeyByKey,
  getApiKeys,
  updateApiKey,
  deleteApiKey,
  resetDbForTesting,
} from "../../db/index.ts";
import { resetConnection } from "../../db/connection.ts";

// ─── Test Setup ─────────────────────────────────────────────────────────────

// Generate unique DATA_DIR for each test to ensure isolation
let testCounter = 0;
function getTestDataDir(): string {
  return `/tmp/bun-llm-test-${Date.now()}-${testCounter++}`;
}

let currentDataDir: string;

beforeEach(() => {
  // Reset database singletons first
  resetDbForTesting();
  resetConnection();

  // Set unique test data directory
  currentDataDir = getTestDataDir();
  process.env.DATA_DIR = currentDataDir;
});

afterEach(() => {
  // Reset singletons first
  resetDbForTesting();
  resetConnection();

  // Clean up test data directory
  if (currentDataDir) {
    try {
      // Delete the router.db file and the directory
      const dbFile = `${currentDataDir}/router.db`;
      Bun.file(dbFile).delete();
      Bun.file(`${currentDataDir}/router.db-shm`).delete();
      Bun.file(`${currentDataDir}/router.db-wal`).delete();
    } catch {
      // Files may not exist
    }
  }
  delete process.env.DATA_DIR;
});

// ─── createApiKey ────────────────────────────────────────────────────────────

describe("createApiKey", () => {
  it("creates a key with name only (no user assigned)", async () => {
    const key = await createApiKey("Test Key");
    expect(key.id).toBeDefined();
    expect(key.name).toBe("Test Key");
    expect(key.key).toMatch(/^sk-[a-f0-9]{32}$/);
    expect(key.isActive).toBe(true);
    expect(key.userId).toBeNull();
    expect(key.createdAt).toBeDefined();
  });

  it("creates a key assigned to a user", async () => {
    const userId = "user-123";
    const key = await createApiKey("User Key", undefined, userId);
    expect(key.userId).toBe(userId);
  });

  it("creates a key with machineId", async () => {
    const machineId = "machine-abc";
    const key = await createApiKey("Machine Key", machineId);
    expect(key.machineId).toBe(machineId);
  });

  it("creates a key with all fields", async () => {
    const key = await createApiKey("Full Key", "machine-xyz", "user-456");
    expect(key.name).toBe("Full Key");
    expect(key.machineId).toBe("machine-xyz");
    expect(key.userId).toBe("user-456");
  });
});

// ─── getApiKeyById ───────────────────────────────────────────────────────────

describe("getApiKeyById", () => {
  it("returns null for non-existent key", async () => {
    const key = await getApiKeyById("non-existent-id");
    expect(key).toBeNull();
  });

  it("returns the key by id", async () => {
    const created = await createApiKey("Test Key");
    const fetched = await getApiKeyById(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.name).toBe("Test Key");
    expect(fetched!.key).toBe(created.key);
    expect(fetched!.isActive).toBe(true);
  });
});

// ─── getApiKeyByKey ──────────────────────────────────────────────────────────

describe("getApiKeyByKey", () => {
  it("returns null for non-existent key string", async () => {
    const key = await getApiKeyByKey("sk-nonexistent");
    expect(key).toBeNull();
  });

  it("returns the key by key string", async () => {
    const created = await createApiKey("Test Key");
    const fetched = await getApiKeyByKey(created.key!);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.name).toBe("Test Key");
  });
});

// ─── getApiKeys ───────────────────────────────────────────────────────────────

describe("getApiKeys", () => {
  it("returns empty array when no keys exist", async () => {
    const keys = await getApiKeys();
    expect(keys).toEqual([]);
  });

  it("returns all keys when no filter", async () => {
    await createApiKey("Key 1");
    await createApiKey("Key 2");
    await createApiKey("Key 3");
    const keys = await getApiKeys();
    expect(keys).toHaveLength(3);
  });

  it("filters by userId", async () => {
    const user1 = "user-1";
    const user2 = "user-2";
    await createApiKey("Key A", undefined, user1);
    await createApiKey("Key B", undefined, user1);
    await createApiKey("Key C", undefined, user2);
    await createApiKey("Unassigned Key");

    const user1Keys = await getApiKeys({ userId: user1 });
    expect(user1Keys).toHaveLength(2);
    expect(user1Keys.every((k) => k.userId === user1)).toBe(true);

    const user2Keys = await getApiKeys({ userId: user2 });
    expect(user2Keys).toHaveLength(1);
    expect(user2Keys[0].name).toBe("Key C");
  });

  it("returns empty array for user with no keys", async () => {
    await createApiKey("Key 1", undefined, "user-1");
    const keys = await getApiKeys({ userId: "user-with-no-keys" });
    expect(keys).toEqual([]);
  });
});

// ─── updateApiKey ─────────────────────────────────────────────────────────────

describe("updateApiKey", () => {
  it("returns null for non-existent key", async () => {
    const result = await updateApiKey("non-existent", { name: "New Name" });
    expect(result).toBeNull();
  });

  it("updates the name", async () => {
    const created = await createApiKey("Original Name");
    const updated = await updateApiKey(created.id, { name: "Updated Name" });
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("Updated Name");
    expect(updated!.id).toBe(created.id);
    expect(updated!.key).toBe(created.key); // unchanged
  });

  it("updates isActive status", async () => {
    const created = await createApiKey("Active Key");
    expect(created.isActive).toBe(true);

    const deactivated = await updateApiKey(created.id, { isActive: false });
    expect(deactivated!.isActive).toBe(false);

    const reactivated = await updateApiKey(created.id, { isActive: true });
    expect(reactivated!.isActive).toBe(true);
  });

  it("updates userId to assign key to user", async () => {
    const created = await createApiKey("Unassigned");
    expect(created.userId).toBeNull();

    const userId = "user-abc";
    const assigned = await updateApiKey(created.id, { userId });
    expect(assigned).not.toBeNull();
    expect(assigned!.userId).toBe(userId);

    // Verify persistence
    const fetched = await getApiKeyById(created.id);
    expect(fetched!.userId).toBe(userId);
  });

  it("updates userId to null to unassign key", async () => {
    const userId = "user-xyz";
    const created = await createApiKey("Assigned", undefined, userId);
    expect(created.userId).toBe(userId);

    const unassigned = await updateApiKey(created.id, { userId: null });
    expect(unassigned).not.toBeNull();
    expect(unassigned!.userId).toBeNull();

    // Verify persistence
    const fetched = await getApiKeyById(created.id);
    expect(fetched!.userId).toBeNull();
  });

  it("updates multiple fields at once", async () => {
    const created = await createApiKey("Original", undefined, "user-1");
    const updated = await updateApiKey(created.id, {
      name: "Renamed",
      isActive: false,
      userId: "user-2",
    });
    expect(updated!.name).toBe("Renamed");
    expect(updated!.isActive).toBe(false);
    expect(updated!.userId).toBe("user-2");
  });

  it("returns unchanged key when no updates provided", async () => {
    const created = await createApiKey("No Change");
    const result = await updateApiKey(created.id, {});
    expect(result).not.toBeNull();
    expect(result!.name).toBe("No Change");
  });
});

// ─── deleteApiKey ─────────────────────────────────────────────────────────────

describe("deleteApiKey", () => {
  it("returns false for non-existent key", async () => {
    const result = await deleteApiKey("non-existent");
    expect(result).toBe(false);
  });

  it("deletes the key and returns true", async () => {
    const created = await createApiKey("To Delete");
    expect(await getApiKeyById(created.id)).not.toBeNull();

    const result = await deleteApiKey(created.id);
    expect(result).toBe(true);
    expect(await getApiKeyById(created.id)).toBeNull();
  });

  it("can create a new key with same name after deletion", async () => {
    const created = await createApiKey("Reusable Name");
    await deleteApiKey(created.id);

    const newKey = await createApiKey("Reusable Name");
    expect(newKey.id).not.toBe(created.id);
    expect(newKey.name).toBe("Reusable Name");
  });
});

// ─── User-Key Assignment Integration ──────────────────────────────────────────

describe("User-Key Assignment Flows", () => {
  it("can assign multiple keys to a user", async () => {
    const userId = "user-multi";
    const key1 = await createApiKey("Key 1");
    const key2 = await createApiKey("Key 2");
    const key3 = await createApiKey("Key 3");

    await updateApiKey(key1.id, { userId });
    await updateApiKey(key2.id, { userId });
    await updateApiKey(key3.id, { userId });

    const userKeys = await getApiKeys({ userId });
    expect(userKeys).toHaveLength(3);
  });

  it("can reassign key from one user to another", async () => {
    const user1 = "user-1";
    const user2 = "user-2";
    const key = await createApiKey("Shared Key", undefined, user1);

    expect(await getApiKeys({ userId: user1 })).toHaveLength(1);
    expect(await getApiKeys({ userId: user2 })).toHaveLength(0);

    await updateApiKey(key.id, { userId: user2 });

    expect(await getApiKeys({ userId: user1 })).toHaveLength(0);
    expect(await getApiKeys({ userId: user2 })).toHaveLength(1);
  });

  it("filtering by userId excludes unassigned keys", async () => {
    await createApiKey("Assigned", undefined, "user-1");
    await createApiKey("Unassigned 1");
    await createApiKey("Unassigned 2");

    const allKeys = await getApiKeys();
    const userKeys = await getApiKeys({ userId: "user-1" });
    const unassignedKeys = allKeys.filter((k) => !k.userId);

    expect(allKeys).toHaveLength(3);
    expect(userKeys).toHaveLength(1);
    expect(unassignedKeys).toHaveLength(2);
  });
});

// ─── Regression Tests ─────────────────────────────────────────────────────────

describe("Regression Tests", () => {
  it("BUG: updateApiKey should persist userId changes (was silently ignored)", async () => {
    // This test would have caught the bug where updateApiKey didn't handle userId
    const key = await createApiKey("Bug Test");
    const userId = "user-bug-test";

    // Before the fix, this would return the key but not persist userId
    const updated = await updateApiKey(key.id, { userId });
    expect(updated).not.toBeNull();

    // After the fix, userId should be persisted
    const fetched = await getApiKeyById(key.id);
    expect(fetched!.userId).toBe(userId);
  });
});
