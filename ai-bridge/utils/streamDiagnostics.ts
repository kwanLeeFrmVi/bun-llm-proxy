// Diagnostic TransformStream for the v2 streaming pipeline.
// Passes bytes through unchanged while tracking:
//   - downstream chunk count and first-chunk timing
//   - upstream error sentinel detection (: __UPSTREAM_ERROR__:)
//   - SSE usage extraction (prompt_tokens, completion_tokens, etc.)
//
// Modeled after 9router's open-sse/utils/stream.js TransformStream pattern.

import type { LogContext } from "../../lib/logger.ts";

export interface DiagnosticState {
  downstreamChunkCount: number;
  firstDownstreamChunkMs: number | null;
  upstreamErrorMsg: string | null;
  finalUsage: {
    prompt_tokens?: number;
    completion_tokens?: number;
    reasoning_tokens?: number;
    cached_tokens?: number;
  } | null;
  firstChunkTime: number | null;
  accumulatedResponseText: string;
}

export interface DiagnosticTransformOpts {
  startTime: number;
  ctx: LogContext;
}

const UPSTREAM_ERROR_SENTINEL = ": __UPSTREAM_ERROR__:";
const SENTINEL_RE = /: __UPSTREAM_ERROR__:[^\n]*\n?/g;
// Maximum chars to hold back for in-progress sentinel detection.
// Must be >= length of the full sentinel prefix so a straddling match
// cannot be missed, but we allow extra room for the trailing message
// portion (we only need up to the next `\n`).
const SENTINEL_HOLDBACK = UPSTREAM_ERROR_SENTINEL.length - 1; // 20
// Safety cap on the SSE parse buffer when upstream never emits `\n\n`.
const MAX_SSE_BUFFER = 1_048_576; // 1 MB

export function createDiagnosticTransform(
  opts: DiagnosticTransformOpts
): { transform: TransformStream<Uint8Array, Uint8Array>; getState: () => DiagnosticState } {
  const { startTime, ctx: _ctx } = opts;
  void _ctx;

  // Persistent TextDecoder with stream: true to handle multi-byte characters split across chunks.
  const decoder = new TextDecoder("utf-8", { fatal: false });

  // Pending text not yet forwarded — holds back a tail window so that
  // a sentinel beginning near a chunk boundary can be detected and
  // stripped before any of its bytes are emitted downstream.
  let pending = "";
  let downstreamChunkCount = 0;
  let firstDownstreamChunkMs: number | null = null;
  let firstChunkTime: number | null = null;
  let upstreamErrorMsg: string | null = null;
  let finalUsage: DiagnosticState["finalUsage"] = null;
  let sseBuffer = "";
  let responseTextParts: string[] = [];

  const state: DiagnosticState = {
    get downstreamChunkCount() { return downstreamChunkCount; },
    get firstDownstreamChunkMs() { return firstDownstreamChunkMs; },
    get upstreamErrorMsg() { return upstreamErrorMsg; },
    get finalUsage() { return finalUsage; },
    get firstChunkTime() { return firstChunkTime; },
    get accumulatedResponseText() { return responseTextParts.join(""); },
  };

  const encoder = new TextEncoder();

  // Strip all complete sentinel lines from `text`. If a trailing partial
  // sentinel prefix is present (no terminating `\n` yet), leaves it in
  // the remainder so the caller can carry it forward.
  const stripSentinels = (text: string): { clean: string; remainder: string } => {
    let work = text;
    // Capture the most recent sentinel message for diagnostics.
    const matches = work.match(SENTINEL_RE);
    if (matches && matches.length > 0) {
      const last = matches[matches.length - 1] ?? "";
      const msg = last.slice(UPSTREAM_ERROR_SENTINEL.length).replace(/\n$/, "").trim();
      upstreamErrorMsg = msg.length > 0 ? msg : "unknown";
      work = work.replace(SENTINEL_RE, "");
    }
    // Detect an unterminated trailing sentinel (or any prefix thereof
    // that could grow into a sentinel) and hold it back.
    const sentinelStart = work.indexOf(UPSTREAM_ERROR_SENTINEL);
    if (sentinelStart !== -1 && !work.slice(sentinelStart).includes("\n")) {
      return { clean: work.slice(0, sentinelStart), remainder: work.slice(sentinelStart) };
    }
    // Otherwise hold back a short tail that could be the start of a sentinel.
    if (work.length >= SENTINEL_HOLDBACK) {
      const tailStart = work.length - SENTINEL_HOLDBACK;
      const tail = work.slice(tailStart);
      // Only hold back if the tail could plausibly be a sentinel prefix.
      for (let i = 0; i < tail.length; i++) {
        if (UPSTREAM_ERROR_SENTINEL.startsWith(tail.slice(i))) {
          return { clean: work.slice(0, tailStart + i), remainder: tail.slice(i) };
        }
      }
    } else {
      for (let i = 0; i < work.length; i++) {
        if (UPSTREAM_ERROR_SENTINEL.startsWith(work.slice(i))) {
          return { clean: work.slice(0, i), remainder: work.slice(i) };
        }
      }
    }
    return { clean: work, remainder: "" };
  };

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk: Uint8Array, controller: TransformStreamDefaultController<Uint8Array>): void {
      // Track diagnostics
      if (!firstChunkTime) firstChunkTime = Date.now();
      if (!firstDownstreamChunkMs) firstDownstreamChunkMs = Date.now() - startTime;
      downstreamChunkCount++;

      const text = decoder.decode(chunk, { stream: true });

      // Append to pending, strip full sentinels, forward the safe prefix,
      // and retain any partial sentinel tail for the next chunk.
      pending += text;
      const { clean, remainder } = stripSentinels(pending);
      pending = remainder;
      if (clean.length > 0) {
        controller.enqueue(encoder.encode(clean));
      }

      // Parse SSE for usage extraction. We use the full decoded `text` so
      // parsing isn't affected by sentinel holdback (sentinel lines are
      // SSE comments and don't participate in event parsing anyway).
      sseBuffer += text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      if (sseBuffer.length > MAX_SSE_BUFFER) {
        // Drop the oldest half to prevent unbounded growth on malformed upstreams.
        sseBuffer = sseBuffer.slice(sseBuffer.length - MAX_SSE_BUFFER / 2);
      }
      while (sseBuffer.includes("\n\n")) {
        const eventEnd = sseBuffer.indexOf("\n\n");
        const eventText = sseBuffer.slice(0, eventEnd + 2);
        sseBuffer = sseBuffer.slice(eventEnd + 2);

        const dataLines: string[] = [];
        for (const line of eventText.split("\n")) {
          if (line.startsWith("data:")) {
            dataLines.push(line.slice(5));
          }
        }
        if (dataLines.length > 0) {
          const dataStr = dataLines.join("");
          try {
            const data = JSON.parse(dataStr);
            const usageSource =
              data.usage && typeof data.usage === "object"
                ? data.usage
                : data.message?.usage && typeof data.message.usage === "object"
                  ? data.message.usage
                  : null;
            if (usageSource) {
              finalUsage = {
                prompt_tokens: usageSource.prompt_tokens ?? usageSource.input_tokens ?? 0,
                completion_tokens:
                  usageSource.completion_tokens ?? usageSource.output_tokens ?? 0,
                reasoning_tokens:
                  usageSource.reasoning_tokens ?? usageSource.thinking_tokens ?? 0,
                cached_tokens: usageSource.prompt_tokens_details?.cached_tokens ?? 0,
              };
            }

            // Accumulate response text for fallback token counting
            const deltaContent = data.choices?.[0]?.delta?.content;
            if (typeof deltaContent === "string") {
              responseTextParts.push(deltaContent);
            }
            const claudeDeltaText = data.delta?.text;
            if (typeof claudeDeltaText === "string") {
              responseTextParts.push(claudeDeltaText);
            }
          } catch {
            // Non-JSON SSE event (e.g. [DONE]) — ignore
          }
        }
      }
    },

    flush(controller: TransformStreamDefaultController<Uint8Array>): void {
      // Emit any remaining pending text. If it is itself a (terminated)
      // sentinel, strip it; otherwise forward unchanged so we don't
      // swallow real trailing content.
      if (pending.length > 0) {
        const { clean } = stripSentinels(pending + "\n");
        // Strip the synthetic newline we appended if it survived.
        const out = clean.endsWith("\n") ? clean.slice(0, -1) : clean;
        if (out.length > 0) {
          controller.enqueue(encoder.encode(out));
        }
        pending = "";
      }

      // Drain any remaining SSE buffer (usage may be in the last event)
      if (sseBuffer.trim().length > 0) {
        const remaining = sseBuffer.trim();
        const dataLines: string[] = [];
        for (const line of remaining.split("\n")) {
          if (line.startsWith("data:")) {
            dataLines.push(line.slice(5));
          }
        }
        if (dataLines.length > 0) {
          try {
            const data = JSON.parse(dataLines.join(""));
            const usageSource =
              data.usage && typeof data.usage === "object"
                ? data.usage
                : data.message?.usage && typeof data.message.usage === "object"
                  ? data.message.usage
                  : null;
            if (usageSource) {
              finalUsage = {
                prompt_tokens: usageSource.prompt_tokens ?? usageSource.input_tokens ?? 0,
                completion_tokens:
                  usageSource.completion_tokens ?? usageSource.output_tokens ?? 0,
                reasoning_tokens:
                  usageSource.reasoning_tokens ?? usageSource.thinking_tokens ?? 0,
                cached_tokens: usageSource.prompt_tokens_details?.cached_tokens ?? 0,
              };
            }

            // Accumulate response text for fallback token counting
            const deltaContent = data.choices?.[0]?.delta?.content;
            if (typeof deltaContent === "string") {
              responseTextParts.push(deltaContent);
            }
            const claudeDeltaText = data.delta?.text;
            if (typeof claudeDeltaText === "string") {
              responseTextParts.push(claudeDeltaText);
            }
          } catch {
            // ignore
          }
        }
      }
    },
  });

  return { transform, getState: () => state };
}
