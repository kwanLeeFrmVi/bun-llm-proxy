# Combo System: Multi-Model Routing with Strategies

## Overview

The Combo System enables routing chat requests across multiple AI models using configurable strategies. It allows you to:

- **Group multiple models** into a single virtual model
- **Route requests intelligently** using different strategies (fallback, round-robin, weight, speed)
- **Handle failures gracefully** with automatic failover
- **Optimize for latency** with TTFT (Time-To-First-Token) tracking

## Core Concepts

### What is a Combo?

A combo is a named group of AI models that behaves like a single model in the API. When you send a request to a combo, the system routes it to one of the member models based on the configured strategy.

**Example:**

```json
{
  "name": "fast-chat",
  "models": ["openai/gpt-4o", "anthropic/claude-3-5-sonnet"]
}
```

This creates a combo named `fast-chat` that can route to either GPT-4o or Claude 3.5 Sonnet.

### Nested Combos

Combos can reference other combos, creating hierarchical model groups. This enables complex routing strategies where you can combine existing combos rather than listing individual models.

**Example:**

```json
{
  "name": "production-chat",
  "models": ["fast-chat", { "model": "coding-models", "weight": 2 }]
}
```

If `fast-chat` and `coding-models` are themselves combos, the system will:

1. **Recursively resolve** each nested combo to its constituent models
2. **Multiply weights** when nesting occurs (nested weight × outer reference weight)
3. **Prevent self-references** (a combo cannot include itself directly or indirectly)
4. **Filter to available models** (only models with active provider connections)

**Weight Multiplication:**

- If `fast-chat` has models with weight 3, and you reference it with weight 2 in `production-chat`, the effective weight becomes 3 × 2 = 6
- This allows proportional scaling of nested combo preferences

**Implementation:** `@/services/model.ts:99-128`

### Database Schema

Combos are stored across three SQLite tables:

#### `combos` — Main combo definitions

```sql
CREATE TABLE IF NOT EXISTS combos (
    id         TEXT PRIMARY KEY,
    name       TEXT UNIQUE NOT NULL,
    models     TEXT NOT NULL,        -- JSON array of model strings
    created_at TEXT,
    updated_at TEXT
);
```

#### `combo_configs` — Per-model weights and settings

```sql
CREATE TABLE IF NOT EXISTS combo_configs (
    combo_name TEXT NOT NULL,
    model      TEXT NOT NULL,
    weight     REAL DEFAULT 1,
    PRIMARY KEY (combo_name, model)
);
```

#### `combo_latency` — TTFT tracking for speed strategy

```sql
CREATE TABLE IF NOT EXISTS combo_latency (
    combo_name TEXT NOT NULL,
    model      TEXT NOT NULL,
    ttft_ms    INTEGER NOT NULL,
    timestamp  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cl ON combo_latency(combo_name, model, timestamp);
```

## Routing Strategies

### 1. Fallback (Default)

Tries models sequentially until one succeeds.

**Behavior:**

- Attempts models in the order they were defined
- Returns the first successful response
- If all models fail, returns 503 with the last error

**Use case:** Prioritize primary model, with backups for reliability.

**Configuration:**

```json
{
  "comboStrategy": "fallback"
}
```

**Implementation:** `@/services/comboRouting.ts:168-189`

---

### 2. Round-Robin

Rotates through models with configurable sticky sessions.

**Behavior:**

- Maintains a per-combo index and sticky count
- Uses the same model for `stickyLimit` consecutive requests
- Advances to the next model when limit is reached
- State is stored in-memory (`rrStateMap`)

**Use case:** Evenly distribute load across models.

**Configuration:**

```json
{
  "comboStrategy": "round-robin",
  "stickyRoundRobinLimit": 3 // Stick to each model for 3 requests
}
```

**Per-combo override:**

```json
{
  "comboStrategies": {
    "my-combo": {
      "strategy": "round-robin",
      "stickyRoundRobinLimit": 5
    }
  }
}
```

**Implementation:** `@/services/comboRouting.ts:62-84`

---

### 3. Weight-Based Random

Randomly selects model by weight, with sequential fallback on failure.

**Behavior:**

- Calculates total weight from all models
- Generates random value and selects by cumulative weight
- Tries selected model first, then falls back to remaining models in order

**Use case:** Route more traffic to preferred models while keeping others available.

**Configuration:**

```json
{
  "name": "weighted-combo",
  "models": [
    { "model": "openai/gpt-4o", "weight": 3 },
    { "model": "anthropic/claude-3-haiku", "weight": 1 }
  ]
}
```

**Implementation:** `@/services/comboRouting.ts:86-128`

---

### 4. Speed (TTFT-Based)

Selects the fastest model based on average Time-To-First-Token.

**Behavior:**

- Queries average TTFT for each model from `combo_latency` table
- Picks the model with lowest average latency
- Sticks to the selected model for `stickySpeedLimit` requests
- Re-evaluates after sticky limit expires
- Records TTFT during streaming responses for future decisions

**Use case:** Optimize for lowest latency in real-time applications.

**Configuration:**

```json
{
  "comboStrategy": "speed",
  "stickySpeedLimit": 3 // Stick to fastest model for 3 requests
}
```

**TTFT Recording:** During streaming responses, TTFT is captured when the first chunk arrives and stored in `combo_latency` table.

**Implementation:**

- Routing: `@/services/comboRouting.ts:131-166`
- TTFT recording: `@/handlers/chat.ts:355-359`

## API Endpoints

### Dashboard API

| Method   | Endpoint          | Description        |
| -------- | ----------------- | ------------------ |
| `GET`    | `/api/combos`     | List all combos    |
| `POST`   | `/api/combos`     | Create a new combo |
| `GET`    | `/api/combos/:id` | Get specific combo |
| `PATCH`  | `/api/combos/:id` | Update combo       |
| `DELETE` | `/api/combos/:id` | Delete combo       |

#### Create Combo

```bash
POST /api/combos
Content-Type: application/json

{
  "name": "my-combo",
  "models": [
    "openai/gpt-4o",
    { "model": "anthropic/claude-3-5-sonnet", "weight": 2 }
  ]
}
```

**Name validation:** Must match regex `^[a-zA-Z0-9_.\-]+$`

### OpenAI-Compatible API

Combos appear as virtual models in the models list:

```bash
GET /v1/models
```

**Response:**

```json
{
  "object": "list",
  "data": [
    {
      "id": "my-combo",
      "object": "model",
      "owned_by": "combo",
      "combo_models": ["openai/gpt-4o", "anthropic/claude-3-5-sonnet"]
    }
  ]
}
```

Use a combo in chat completions:

```bash
POST /v1/chat/completions
Authorization: Bearer $API_KEY
Content-Type: application/json

{
  "model": "my-combo",
  "messages": [{"role": "user", "content": "Hello!"}]
}
```

## Global Settings

Combo behavior is controlled through the settings system (`@/db/schema.ts:270-291`):

| Setting                 | Default      | Description                                    |
| ----------------------- | ------------ | ---------------------------------------------- |
| `comboStrategy`         | `"fallback"` | Default routing strategy for all combos        |
| `comboStrategies`       | `{}`         | Per-combo strategy overrides                   |
| `stickyRoundRobinLimit` | `3`          | Default sticky limit for round-robin and speed |

### Strategy Resolution Order

When a request comes in for a combo:

1. Check `comboStrategies[comboName].strategy` for combo-specific setting
2. Fall back to global `comboStrategy`
3. Default to `"fallback"`

**Code:** `@/handlers/chat.ts:92-94`

## Architecture Flow

### Creating a Combo

```text
POST /api/combos
├── Validate name (regex: ^[a-zA-Z0-9_.\-]+$)
├── Check name uniqueness
├── Validate models array
├── normalizeModels() → extract model strings
├── createCombo() → INSERT INTO combos
├── normalizeComboConfig() → build weight config
└── setComboConfig() → INSERT INTO combo_configs
```

**Entry points:**

- API handler: `@/routes/api/combos/index.ts:39`
- DB insert: `@/db/index.ts:1047`

### Chat Request Routing

```text
POST /v1/chat/completions (with combo model)
├── handleChat() receives request
├── getComboModelConfigs(modelStr) checks if model is combo
├── Resolve strategy: combo-specific > global > fallback
├── handleComboModelWithDB() injects getAverageTTFT
└── handleComboModel() executes strategy
    ├── round-robin: rotate with sticky limit
    ├── weight: random selection by weight
    ├── speed: pick lowest avg TTFT
    └── fallback: sequential try
```

**Entry points:**

- Chat handler: `@/handlers/chat.ts:90-112`
- Combo routing: `@/services/comboRouting.ts:59`

### TTFT Tracking for Speed Strategy

```text
Streaming Response
├── wrapStreamingResponse()
├── On first chunk received
├── Calculate TTFT = Date.now() - startTime
└── recordComboTTFT()
    └── INSERT INTO combo_latency
```

**Entry points:**

- TTFT recording: `@/handlers/chat.ts:357`
- DB insert: `@/db/index.ts:1143`

## Code Reference

### Key Files

| File                           | Purpose                                  |
| ------------------------------ | ---------------------------------------- |
| `@/services/comboRouting.ts`   | Strategy implementations                 |
| `@/services/model.ts`          | Combo model resolution                   |
| `@/handlers/chat.ts`           | Chat request handling with combo support |
| `@/routes/api/combos/index.ts` | Combo CRUD API                           |
| `@/routes/v1/models/index.ts`  | OpenAI-compatible models list            |
| `@/db/index.ts`                | Database operations for combos           |
| `@/db/schema.ts`               | Table definitions                        |

### State Management

```typescript
// Round-robin state: comboName → { index, stickyCount }
const rrStateMap = new Map<string, { index: number; stickyCount: number }>();

// Speed strategy state: comboName → { model, count }
const speedStateMap = new Map<string, { model: string; count: number }>();
```

### Metadata Attachment

Combo metadata is attached to responses using a Symbol:

```typescript
const COMBO_METADATA = Symbol.for("comboMetadata");

interface ComboMetadata {
  comboName: string;
  selectedModel: string;
  startTime: number;
}
```

This allows downstream code to track which combo and model actually handled the request.

## Testing

Reset combo state between tests:

```typescript
import { resetComboState, resetAllComboState } from "@/services/comboRouting";

// Reset specific combo
resetComboState("my-combo");

// Reset all combo state
resetAllComboState();
```

## Best Practices

1. **Use descriptive names** — Combo names should clearly indicate purpose (e.g., `fast-chat`, `coding-models`)

2. **Order matters in fallback** — Put your preferred primary model first

3. **Set appropriate weights** — Higher weight = more traffic in weight strategy

4. **Monitor TTFT data** — Speed strategy requires sufficient samples; new combos start with no data

5. **Filter unavailable models** — Combos only appear in `/v1/models` if at least one member has an active provider connection

6. **Sticky limits** — Higher sticky limits reduce strategy re-evaluation overhead but may reduce responsiveness to changing conditions
