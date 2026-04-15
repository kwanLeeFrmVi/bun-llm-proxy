// Combo routing strategies - extracted for testability

// Per-combo round-robin state: index, stickyCount
const rrStateMap = new Map<string, { index: number; stickyCount: number }>();

// Per-combo speed state: model, count
const speedStateMap = new Map<string, { model: string; count: number }>();

// Symbol to attach combo metadata to Response (private, non-enumerable)
const COMBO_METADATA = Symbol.for("comboMetadata");

import type { RequestContext } from "../lib/requestContext.ts";

export interface ComboMetadata {
  comboName: string;
  selectedModel: string;
  startTime: number;
}

export interface ComboModelConfig {
  model: string;
  weight: number;
}

import type { LogContext } from "../lib/requestContext.ts";

export interface ComboOptions {
  ctx?: RequestContext;
  body: Record<string, unknown>;
  models: ComboModelConfig[];
  handleSingleModel: (body: Record<string, unknown>, model: string) => Promise<Response>;
  log: {
    info: (ctx: LogContext, tag: string, message: string, data?: unknown) => void;
    warn: (ctx: LogContext, tag: string, message: string, data?: unknown) => void;
  };
  comboName: string;
  comboStrategy: string;
  settings: Record<string, unknown>;
  getAverageTTFT?: (
    comboName: string,
    model: string,
    sampleCount?: number
  ) => Promise<number | null>;
}

function attachComboMetadata(resp: Response, comboName: string, selectedModel: string): Response {
  (resp as unknown as { [COMBO_METADATA]?: ComboMetadata })[COMBO_METADATA] = {
    comboName,
    selectedModel,
    startTime: Date.now(),
  };
  return resp;
}

export function getComboMetadata(resp: Response): ComboMetadata | undefined {
  return (resp as unknown as { [COMBO_METADATA]?: ComboMetadata })[COMBO_METADATA];
}

/**
 * Combo routing strategies:
 * - fallback: sequential try, first success wins
 * - round-robin: rotate through models with sticky limit
 * - weight: weighted random selection, fallback sequentially on failure
 * - speed: pick fastest by avg TTFT, stick for N requests, re-evaluate on expiry
 */
export async function handleComboModel(opts: ComboOptions): Promise<Response> {
  const {
    body,
    models,
    handleSingleModel,
    log,
    comboName,
    comboStrategy,
    settings,
    getAverageTTFT,
    ctx,
  } = opts;

  if (comboStrategy === "round-robin") {
    const stickyLimit =
      ((settings.comboStrategies as Record<string, Record<string, unknown>> | undefined)?.[
        comboName
      ]?.stickyRoundRobinLimit as number | undefined) ??
      (settings.stickyRoundRobinLimit as number | undefined) ??
      1;

    const rrState = rrStateMap.get(comboName) ?? { index: 0, stickyCount: 0 };
    let selectedIndex: number;
    if (rrState.stickyCount < stickyLimit) {
      rrState.stickyCount++;
      rrStateMap.set(comboName, rrState);
      selectedIndex = rrState.index % models.length;
      log.info(
        ctx ?? null,
        "COMBO",
        `Round-robin: using ${models[selectedIndex]!.model} (index ${rrState.index}, sticky ${rrState.stickyCount}/${stickyLimit})`
      );
    } else {
      // advance to next model
      rrState.index = (rrState.index + 1) % models.length;
      rrState.stickyCount = 1;
      rrStateMap.set(comboName, rrState);
      selectedIndex = rrState.index;
      log.info(
        ctx ?? null,
        "COMBO",
        `Round-robin: advanced to ${models[selectedIndex]!.model} (index ${rrState.index}, sticky 1/${stickyLimit})`
      );
    }

    // Try selected model first
    const selectedModel = models[selectedIndex]!.model;
    let lastError: string | null = null;
    try {
      const resp = await handleSingleModel(body, selectedModel);
      if (resp.ok) {
        return attachComboMetadata(resp, comboName, selectedModel);
      }
      lastError = `Model ${selectedModel} returned status ${resp.status}`;
      log.warn(ctx ?? null, "COMBO", `Round-robin: ${selectedModel} failed (${resp.status}), trying fallback`);
    } catch (e) {
      lastError = `${selectedModel}: ${e instanceof Error ? e.message : String(e)}`;
      log.warn(ctx ?? null, "COMBO", `Round-robin: ${selectedModel} threw, trying fallback`);
    }

    // Fallback: try remaining models in order
    for (let i = 1; i < models.length; i++) {
      const idx = (selectedIndex + i) % models.length;
      const m = models[idx]!;
      log.info(ctx ?? null, "COMBO", `Round-robin fallback: trying ${m.model}`);
      try {
        const resp = await handleSingleModel(body, m.model);
        if (resp.ok) {
          log.info(ctx ?? null, "COMBO", `Round-robin fallback: ${m.model} succeeded`);
          return attachComboMetadata(resp, comboName, m.model);
        }
        lastError = `Model ${m.model} returned status ${resp.status}`;
      } catch (e) {
        lastError = `${m.model}: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    return new Response(JSON.stringify({ error: lastError ?? "All combo models failed" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (comboStrategy === "weight") {
    const totalWeight = models.reduce((sum, m) => sum + m.weight, 0);
    const r = Math.random() * totalWeight;
    let runningWeight = 0;
    let selectedIndex = 0;

    for (let i = 0; i < models.length; i++) {
      runningWeight += models[i]!.weight;
      if (r <= runningWeight) {
        selectedIndex = i;
        break;
      }
    }

    const selectedModel = models[selectedIndex]!.model;

    // Try selected model first, then fallback to remaining models in order
    const remainingModels = [
      models[selectedIndex]!,
      ...models.slice(0, selectedIndex),
      ...models.slice(selectedIndex + 1),
    ];

    log.info(ctx ?? null, "COMBO", `Weight: trying ${selectedModel}`);

    let lastError: string | null = null;
    for (const m of remainingModels) {
      try {
        const resp = await handleSingleModel(body, m.model);
        if (resp.ok) {
          log.info(ctx ?? null, "COMBO", `Weight: model ${m.model} succeeded`);
          return attachComboMetadata(resp, comboName, m.model);
        }
        // Only capture the first failure, not subsequent ones
        if (!lastError) lastError = `Model ${m.model} returned status ${resp.status}`;
      } catch (e) {
        if (!lastError) lastError = `${m.model}: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    return new Response(JSON.stringify({ error: lastError ?? "All combo models failed" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (comboStrategy === "speed") {
    if (!getAverageTTFT) {
      // Fallback to first model if no TTFT function provided
      const selectedModel = models[0]!.model;
      const resp = await handleSingleModel(body, selectedModel);
      return attachComboMetadata(resp, comboName, selectedModel);
    }

    const stickyLimit =
      ((settings.comboStrategies as Record<string, Record<string, unknown>> | undefined)?.[
        comboName
      ]?.stickySpeedLimit as number | undefined) ??
      (settings.stickyRoundRobinLimit as number | undefined) ??
      3;

    // Determine which model to try first
    let orderedModels: Array<{ model: string; avgMs: number | null }>;

    const state = speedStateMap.get(comboName);
    if (state && state.count < stickyLimit) {
      state.count++;
      speedStateMap.set(comboName, state);
      log.info(
        ctx ?? null,
        "COMBO",
        `Speed: using ${state.model} (sticky ${state.count}/${stickyLimit})`
      );
      // Put sticky model first, rest in original order
      orderedModels = [
        { model: state.model, avgMs: null },
        ...models.filter((m) => m.model !== state.model).map((m) => ({ model: m.model, avgMs: null })),
      ];
    } else {
      // re-evaluate: pick model with lowest avg TTFT
      log.info(ctx ?? null, "COMBO", `Speed: re-evaluating fastest model...`);
      orderedModels = await Promise.all(
        models.map(async (m) => ({
          model: m.model,
          avgMs: await getAverageTTFT(comboName, m.model),
        }))
      );
      orderedModels.sort((a, b) => (a.avgMs ?? Infinity) - (b.avgMs ?? Infinity));
      const fastest = orderedModels[0]!;
      speedStateMap.set(comboName, { model: fastest.model, count: 1 });
      log.info(
        ctx ?? null,
        "COMBO",
        `Speed: selected ${fastest.model} (avg TTFT: ${fastest.avgMs ?? "no data"}ms)`
      );
    }

    // Try models in order (fastest first), fallback on failure
    let lastError: string | null = null;
    for (let i = 0; i < orderedModels.length; i++) {
      const m = orderedModels[i]!;
      if (i > 0) {
        log.info(ctx ?? null, "COMBO", `Speed fallback: trying ${m.model}`);
      }
      try {
        const resp = await handleSingleModel(body, m.model);
        if (resp.ok) {
          if (i > 0) log.info(ctx ?? null, "COMBO", `Speed fallback: ${m.model} succeeded`);
          return attachComboMetadata(resp, comboName, m.model);
        }
        lastError = `Model ${m.model} returned status ${resp.status}`;
        if (i === 0) {
          log.warn(ctx ?? null, "COMBO", `Speed: ${m.model} failed (${resp.status}), trying fallback`);
        }
      } catch (e) {
        lastError = `${m.model}: ${e instanceof Error ? e.message : String(e)}`;
        if (i === 0) {
          log.warn(ctx ?? null, "COMBO", `Speed: ${m.model} threw, trying fallback`);
        }
      }
    }

    return new Response(JSON.stringify({ error: lastError ?? "All combo models failed" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  // fallback (default): try each model in order
  let lastError: string | null = null;
  let attemptNumber = 1;
  for (const m of models) {
    log.info(
      ctx ?? null,
      "COMBO",
      `Fallback: trying model ${attemptNumber}/${models.length}: ${m.model}`
    );
    try {
      const resp = await handleSingleModel(body, m.model);
      if (resp.ok) {
        log.info(ctx ?? null, "COMBO", `Fallback: model ${m.model} succeeded`);
        return attachComboMetadata(resp, comboName, m.model);
      }
      lastError = `Model ${m.model} returned status ${resp.status}`;
    } catch (e) {
      lastError = `${m.model}: ${e instanceof Error ? e.message : String(e)}`;
    }
    attemptNumber++;
  }

  return new Response(JSON.stringify({ error: lastError ?? "All combo models failed" }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Reset state for a combo (useful for testing)
 */
export function resetComboState(comboName: string): void {
  rrStateMap.delete(comboName);
  speedStateMap.delete(comboName);
}

/**
 * Reset all combo state (useful for testing)
 */
export function resetAllComboState(): void {
  rrStateMap.clear();
  speedStateMap.clear();
}
