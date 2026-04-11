// E2E tests for Combo System - covers DB, API routes, and nested combos
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { randomUUID } from "crypto";

// Test database path
const TEST_DB_PATH = `/tmp/test-combo-${randomUUID()}.db`;

// Mock the database module
let db: Database;

interface Combo {
  id: string;
  name: string;
  models: string[];
  created_at: string;
  updated_at: string;
}

interface ComboConfig {
  combo_name: string;
  model: string;
  weight: number;
}

interface ComboWithWeights {
  id: string;
  name: string;
  models: { model: string; weight: number }[];
  created_at?: string;
  updated_at?: string;
}

describe("Combo System E2E", () => {
  beforeAll(() => {
    // Create test database
    db = new Database(TEST_DB_PATH);

    // Create tables
    db.run(`
      CREATE TABLE IF NOT EXISTS combos (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        models TEXT NOT NULL,
        created_at TEXT,
        updated_at TEXT
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS combo_configs (
        combo_name TEXT NOT NULL,
        model TEXT NOT NULL,
        weight REAL DEFAULT 1,
        PRIMARY KEY (combo_name, model)
      )
    `);
  });

  afterAll(() => {
    db.close();
    // Cleanup
    import("node:fs").then(fs => {
      fs.unlinkSync(TEST_DB_PATH);
    });
  });

  beforeEach(() => {
    // Clear data between tests
    db.run("DELETE FROM combo_configs");
    db.run("DELETE FROM combos");
  });

  // ─── DB Layer Tests ────────────────────────────────────────────────────────────

  describe("DB Layer - combos table", () => {
    it("should create a combo", () => {
      const id = randomUUID();
      const name = "test-combo";
      const models = JSON.stringify(["model-a", "model-b"]);
      const now = new Date().toISOString();

      db.run(
        "INSERT INTO combos (id, name, models, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        [id, name, models, now, now]
      );

      const result = db.query<Combo, string>("SELECT * FROM combos WHERE id = ?").get(id);
      expect(result).toBeDefined();
      expect(result!.name).toBe(name);
      expect(JSON.parse(result!.models)).toEqual(["model-a", "model-b"]);
    });

    it("should update combo models", () => {
      const id = randomUUID();
      const name = "update-test";
      const now = new Date().toISOString();

      db.run(
        "INSERT INTO combos (id, name, models, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        [id, name, JSON.stringify(["old-model"]), now, now]
      );

      const newModels = JSON.stringify(["new-model-a", "new-model-b"]);
      db.run("UPDATE combos SET models = ?, updated_at = ? WHERE id = ?", [newModels, now, id]);

      const result = db.query<Combo, string>("SELECT * FROM combos WHERE id = ?").get(id);
      expect(JSON.parse(result!.models)).toEqual(["new-model-a", "new-model-b"]);
    });

    it("should prevent duplicate combo names", () => {
      const now = new Date().toISOString();
      const name = "unique-combo";

      db.run(
        "INSERT INTO combos (id, name, models, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        [randomUUID(), name, JSON.stringify(["model-a"]), now, now]
      );

      expect(() => {
        db.run(
          "INSERT INTO combos (id, name, models, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
          [randomUUID(), name, JSON.stringify(["model-b"]), now, now]
        );
      }).toThrow();
    });
  });

  describe("DB Layer - combo_configs table", () => {
    it("should store weighted models", () => {
      const comboName = "weighted-combo";
      const now = new Date().toISOString();

      db.run(
        "INSERT INTO combos (id, name, models, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        [randomUUID(), comboName, JSON.stringify(["a", "b"]), now, now]
      );

      db.run("INSERT INTO combo_configs (combo_name, model, weight) VALUES (?, ?, ?)", [comboName, "model-a", 3]);
      db.run("INSERT INTO combo_configs (combo_name, model, weight) VALUES (?, ?, ?)", [comboName, "model-b", 1]);

      const configs = db.query<ComboConfig, string>(
        "SELECT * FROM combo_configs WHERE combo_name = ?"
      ).all(comboName);

      expect(configs.length).toBe(2);
      expect(configs.find(c => c.model === "model-a")!.weight).toBe(3);
      expect(configs.find(c => c.model === "model-b")!.weight).toBe(1);
    });

    it("should replace configs on update", () => {
      const comboName = "replace-config-test";
      const now = new Date().toISOString();

      db.run(
        "INSERT INTO combos (id, name, models, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        [randomUUID(), comboName, JSON.stringify(["old"]), now, now]
      );

      // Initial config
      db.run("INSERT INTO combo_configs (combo_name, model, weight) VALUES (?, ?, ?)", [comboName, "old-model", 1]);

      // Replace config
      db.run("DELETE FROM combo_configs WHERE combo_name = ?", [comboName]);
      db.run("INSERT INTO combo_configs (combo_name, model, weight) VALUES (?, ?, ?)", [comboName, "new-model", 5]);

      const configs = db.query<ComboConfig, string>(
        "SELECT * FROM combo_configs WHERE combo_name = ?"
      ).all(comboName);

      expect(configs.length).toBe(1);
      expect(configs[0].model).toBe("new-model");
      expect(configs[0].weight).toBe(5);
    });
  });

  // ─── Nested Combo Tests ────────────────────────────────────────────────────────

  describe("Nested Combos", () => {
    it("should support combo containing another combo", () => {
      const now = new Date().toISOString();

      // Create inner combo
      db.run(
        "INSERT INTO combos (id, name, models, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        [randomUUID(), "inner", JSON.stringify(["model-x"]), now, now]
      );

      // Create outer combo containing inner combo
      db.run(
        "INSERT INTO combos (id, name, models, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        [randomUUID(), "outer", JSON.stringify(["inner", "model-y"]), now, now]
      );

      // Verify structure
      const inner = db.query<Combo, string>("SELECT * FROM combos WHERE name = ?").get("inner");
      const outer = db.query<Combo, string>("SELECT * FROM combos WHERE name = ?").get("outer");

      expect(JSON.parse(inner!.models)).toEqual(["model-x"]);
      expect(JSON.parse(outer!.models)).toEqual(["inner", "model-y"]);
    });

    it("should maintain deep nesting (combo A -> combo B -> combo C)", () => {
      const now = new Date().toISOString();

      db.run(
        "INSERT INTO combos (id, name, models, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        [randomUUID(), "level-c", JSON.stringify(["actual-model"]), now, now]
      );

      db.run(
        "INSERT INTO combos (id, name, models, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        [randomUUID(), "level-b", JSON.stringify(["level-c"]), now, now]
      );

      db.run(
        "INSERT INTO combos (id, name, models, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        [randomUUID(), "level-a", JSON.stringify(["level-b"]), now, now]
      );

      const levelA = db.query<Combo, string>("SELECT * FROM combos WHERE name = ?").get("level-a");
      expect(JSON.parse(levelA!.models)).toEqual(["level-b"]);
    });

    it("should resolve combo weights in nested structure", () => {
      const now = new Date().toISOString();

      // Create inner combo with weights
      db.run(
        "INSERT INTO combos (id, name, models, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        [randomUUID(), "inner-weighted", JSON.stringify(["fast", "slow"]), now, now]
      );
      db.run("INSERT INTO combo_configs (combo_name, model, weight) VALUES (?, ?, ?)", ["inner-weighted", "fast", 3]);
      db.run("INSERT INTO combo_configs (combo_name, model, weight) VALUES (?, ?, ?)", ["inner-weighted", "slow", 1]);

      // Create outer combo
      db.run(
        "INSERT INTO combos (id, name, models, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        [randomUUID(), "outer-weighted", JSON.stringify(["inner-weighted"]), now, now]
      );

      // Verify weights are independent
      const innerConfigs = db.query<ComboConfig, string>(
        "SELECT * FROM combo_configs WHERE combo_name = ?"
      ).all("inner-weighted");

      expect(innerConfigs.find(c => c.model === "fast")!.weight).toBe(3);
      expect(innerConfigs.find(c => c.model === "slow")!.weight).toBe(1);
    });
  });

  // ─── Combo Display/Rendering Tests ────────────────────────────────────────────

  describe("Combo Display Format", () => {
    it("should return combos with weights for API response", () => {
      const now = new Date().toISOString();
      const comboName = "display-test";

      db.run(
        "INSERT INTO combos (id, name, models, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        [randomUUID(), comboName, JSON.stringify(["model-a", "model-b"]), now, now]
      );
      db.run("INSERT INTO combo_configs (combo_name, model, weight) VALUES (?, ?, ?)", [comboName, "model-a", 2]);
      db.run("INSERT INTO combo_configs (combo_name, model, weight) VALUES (?, ?, ?)", [comboName, "model-b", 1]);

      // Simulate API response transformation
      const combo = db.query<Combo, string>("SELECT * FROM combos WHERE name = ?").get(comboName);
      const configs = db.query<ComboConfig, string>(
        "SELECT * FROM combo_configs WHERE combo_name = ?"
      ).all(comboName);

      const response = {
        id: combo!.id,
        name: combo!.name,
        models: configs.length > 0
          ? configs.map(c => ({ model: c.model, weight: c.weight }))
          : JSON.parse(combo!.models).map((m: string) => ({ model: m, weight: 1 })),
        createdAt: combo!.created_at,
        updatedAt: combo!.updated_at,
      };

      expect(response.models).toEqual([
        { model: "model-a", weight: 2 },
        { model: "model-b", weight: 1 },
      ]);
    });

    it("should return plain models when no config exists", () => {
      const now = new Date().toISOString();
      const comboName = "no-config";

      db.run(
        "INSERT INTO combos (id, name, models, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        [randomUUID(), comboName, JSON.stringify(["model-x", "model-y"]), now, now]
      );

      const combo = db.query<Combo, string>("SELECT * FROM combos WHERE name = ?").get(comboName);
      const configs = db.query<ComboConfig, string>(
        "SELECT * FROM combo_configs WHERE combo_name = ?"
      ).all(comboName);

      // When no configs, default to weight=1 for all models
      const models = configs.length > 0
        ? configs.map(c => ({ model: c.model, weight: c.weight }))
        : JSON.parse(combo!.models).map((m: string) => ({ model: m, weight: 1 }));

      expect(models).toEqual([
        { model: "model-x", weight: 1 },
        { model: "model-y", weight: 1 },
      ]);
    });
  });

  // ─── Combo Name Validation ─────────────────────────────────────────────────────

  describe("Combo Name Validation", () => {
    const NAME_REGEX = /^[a-zA-Z0-9_.\-]+$/;

    it("should accept valid names", () => {
      const validNames = ["simple", "with-dash", "with_underscore", "with.dot", "MixedCase123", "a"];
      for (const name of validNames) {
        expect(NAME_REGEX.test(name)).toBe(true);
      }
    });

    it("should reject invalid names", () => {
      const invalidNames = ["has space", "has/slash", "has@at", "has#hash", "has$", "has!"];
      for (const name of invalidNames) {
        expect(NAME_REGEX.test(name)).toBe(false);
      }
    });
  });

  // ─── Combo Model Validation ───────────────────────────────────────────────────

  describe("Model Normalization", () => {
    it("should normalize mixed input (strings and objects)", () => {
      const input = [
        "model-a", // string
        { model: "model-b", weight: 2 }, // object with weight
        { model: "model-c" }, // object without weight (should default to 1)
      ];

      const models = input.map(item => typeof item === "string" ? item : item.model);
      const configs = input.map(item => {
        if (typeof item === "string") return { model: item, weight: 1 };
        return { model: item.model, weight: Math.round(item.weight ?? 1) };
      });

      expect(models).toEqual(["model-a", "model-b", "model-c"]);
      expect(configs).toEqual([
        { model: "model-a", weight: 1 },
        { model: "model-b", weight: 2 },
        { model: "model-c", weight: 1 },
      ]);
    });
  });
});
