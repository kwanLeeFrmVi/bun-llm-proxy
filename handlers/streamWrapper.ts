// v2 streaming wrapper — pipeline-based architecture.
// Replaces the 300-line manual pump loop in handlers/chat.ts:wrapStreamingResponse
// with a composable TransformStream pipeline modeled after 9router's
// open-sse/utils/streamHandler.js pattern.
//
// Pipeline: upstream.body → diagnosticsTransform → heartbeatTransform → disconnectAwareReadable → client
//
// The runtime manages backpressure, controller lifecycle, and cancellation.
// No safeEnqueue/safeClose/controllerClosed bookkeeping needed.

import { createDiagnosticTransform } from "../ai-bridge/utils/streamDiagnostics.ts";
import { createHeartbeatTransform } from "../ai-bridge/utils/streamHeartbeat.ts";
import * as log from "../lib/logger.ts";
import { RequestContext } from "../lib/requestContext.ts";
import { saveRequestUsage } from "../stubs/usageDb.ts";
import { getComboMetadata } from "../services/comboRouting.ts";
import { recordComboTTFT } from "../db/index.ts";
import { buildClaudeErrorEvent, mapToAnthropicErrorType } from "../ai-bridge/translator/common/sse.ts";
import { STREAM_HEARTBEAT_INTERVAL_MS } from "../ai-bridge/config/runtimeConfig.ts";

// Marker to detect responses already wrapped by wrapStreamingResponse.
// Prevents double-wrapping when a combo model resolves to another combo model.
export const WRAPPED_STREAM_MARKER = Symbol.for("wrappedStream");

export function isAlreadyWrappedStream(resp: Response): boolean {
  return (resp as unknown as Record<symbol, unknown>)[WRAPPED_STREAM_MARKER] === true;
}

type CloseReason = "normal" | "downstream_canceled" | "inner_stream_error" | "upstream_error";

export function wrapStreamingResponseV2(
  response: Response,
  requestId: string,
  provider: string,
  model: string,
  startTime: number,
  ctx: RequestContext,
  sourceFormat: string,
  clientSignal?: AbortSignal
): Response {
  if (!response.body) return response;

  // Detect client abort early to avoid wasting upstream resources
  if (clientSignal?.aborted) {
    try { response.body.cancel(); } catch { /* already closed */ }
    return new Response(null, { status: 499, statusText: "Client Closed Request", headers: response.headers });
  }

  const comboMetadata = getComboMetadata(response);

  // Build the transform pipeline
  const { transform: diagnosticsTransform, getState } = createDiagnosticTransform({
    startTime,
    ctx,
  });
  const { transform: heartbeatTransform, stop: stopHeartbeat } = createHeartbeatTransform(STREAM_HEARTBEAT_INTERVAL_MS);

  // Pipe: upstream → diagnostics → heartbeat
  const pipedBody = response.body
    .pipeThrough(diagnosticsTransform)
    .pipeThrough(heartbeatTransform);

  // Once-only settlement guard
  let settled = false;
  let cleanupAbortListener: (() => void) | null = null;

  const onSettled = (closeReason: CloseReason, error?: string) => {
    if (settled) return;
    settled = true;

    // Stop heartbeat timers to prevent leak
    stopHeartbeat();

    // Remove abort listener to prevent leak on normal completion
    cleanupAbortListener?.();
    cleanupAbortListener = null;

    const st = getState();
    const durationMs = Date.now() - startTime;

    // Record TTFT for combo models
    if (comboMetadata && st.firstChunkTime) {
      const ttftMs = st.firstChunkTime - startTime;
      recordComboTTFT(comboMetadata.comboName, comboMetadata.selectedModel, ttftMs).catch(
        (e: unknown) => {
          log.debug(ctx, "COMBO", `recordComboTTFT failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      );
    }

    // Emit the appropriate log event
    if (closeReason === "normal" && !st.upstreamErrorMsg) {
      // Detect empty upstream responses at the outer layer: 0 completion tokens
      // means the upstream returned no useful content despite a 200 status.
      const isEmptyResponse = st.finalUsage &&
        (st.finalUsage.completion_tokens ?? 0) === 0 &&
        (st.finalUsage.prompt_tokens ?? 0) === 0 &&
        st.downstreamChunkCount <= 5;

      if (isEmptyResponse) {
        log.stream(ctx, "OUTER_ERROR", {
          provider,
          model,
          error: "Empty upstream response: 0 tokens received",
          closeReason: "upstream_error" as CloseReason,
          downstreamChunkCount: st.downstreamChunkCount,
          firstDownstreamChunkMs: st.firstDownstreamChunkMs,
          durationMs,
        });
      } else {
        log.stream(ctx, "OUTER_COMPLETE", {
          provider,
          model,
          usage: st.finalUsage,
          closeReason: "normal" as CloseReason,
          downstreamChunkCount: st.downstreamChunkCount,
          firstDownstreamChunkMs: st.firstDownstreamChunkMs,
          durationMs,
        });
      }
    } else if (closeReason === "upstream_error" || st.upstreamErrorMsg) {
      log.stream(ctx, "OUTER_ERROR", {
        provider,
        model,
        error: `Upstream stream truncated: ${st.upstreamErrorMsg ?? error ?? "unknown"}`,
        closeReason: "upstream_error" as CloseReason,
        downstreamChunkCount: st.downstreamChunkCount,
        firstDownstreamChunkMs: st.firstDownstreamChunkMs,
        durationMs,
      });
    } else if (closeReason === "downstream_canceled") {
      log.stream(ctx, "OUTER_CANCELED", {
        provider,
        model,
        error: error ?? "client disconnected",
        closeReason: "downstream_canceled" as CloseReason,
        downstreamChunkCount: st.downstreamChunkCount,
        firstDownstreamChunkMs: st.firstDownstreamChunkMs,
        durationMs,
      });
    } else {
      log.stream(ctx, "OUTER_ERROR", {
        provider,
        model,
        error: error ?? "unknown error",
        closeReason,
        downstreamChunkCount: st.downstreamChunkCount,
        firstDownstreamChunkMs: st.firstDownstreamChunkMs,
        durationMs,
      });
    }

    // Save usage (fire-and-forget with catch)
    const ttftMs = st.firstChunkTime ? st.firstChunkTime - startTime : undefined;
    const completionTokens = st.finalUsage?.completion_tokens ?? 0;
    const tokensPerSecond =
      ttftMs && completionTokens > 0 && durationMs > ttftMs
        ? (completionTokens / (durationMs - ttftMs)) * 1000
        : undefined;
    saveRequestUsage(
      requestId,
      {
        ...(st.finalUsage ?? {}),
        provider,
        model,
        ttft_ms: ttftMs,
        tokens_per_second: tokensPerSecond,
      },
      durationMs
    ).catch((e) => {
      log.debug(ctx, "USAGE", `saveRequestUsage failed: ${e instanceof Error ? e.message : String(e)}`);
    });

    RequestContext.delete(ctx.id);
  };

  // Build the disconnect-aware readable stream (pull-based, like 9router)
  const reader = pipedBody.getReader();

  const finalStream = new ReadableStream({
    async pull(controller: ReadableStreamDefaultController<Uint8Array>) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          onSettled("normal");
          try { controller.close(); } catch { /* already closed */ }
          return;
        }
        controller.enqueue(value);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        // AbortError means client disconnected
        const isAbort = err instanceof Error && err.name === "AbortError";
        onSettled(isAbort ? "downstream_canceled" : "inner_stream_error", errMsg);

        // Inject error SSE events so the client doesn't hang
        injectErrorEvents(controller, sourceFormat, model, errMsg);

        try { controller.close(); } catch { /* already closed */ }
      }
    },

    cancel(_reason?: string) {
      onSettled("downstream_canceled", _reason ?? "client disconnected");
      reader.cancel().catch(() => {});
    },
  });

  // Listen for client abort signal to detect disconnect early
  if (clientSignal && !clientSignal.aborted) {
    const onAbort = () => {
      onSettled("downstream_canceled", "client signal aborted");
      reader.cancel().catch(() => {});
    };
    clientSignal.addEventListener("abort", onAbort, { once: true });
    cleanupAbortListener = () => clientSignal.removeEventListener("abort", onAbort);
  }

  const finalResponse = new Response(finalStream, {
    status: response.status,
    headers: response.headers,
  });
  (finalResponse as unknown as Record<symbol, boolean>)[WRAPPED_STREAM_MARKER] = true;
  return finalResponse;
}

/**
 * Inject format-specific SSE error termination events into the stream.
 * Ensures Claude Code doesn't hang waiting for message_delta/message_stop.
 */
function injectErrorEvents(
  controller: ReadableStreamDefaultController<Uint8Array>,
  sourceFormat: string,
  model: string,
  errMsg: string
): void {
  const encoder = new TextEncoder();
  const errMsgForClient = `Stream error: ${errMsg}`;

  try {
    if (sourceFormat === "claude") {
      // Anthropic error event
      controller.enqueue(
        encoder.encode(buildClaudeErrorEvent(mapToAnthropicErrorType(null, errMsg), errMsgForClient))
      );
      // Text delta with error message
      controller.enqueue(
        encoder.encode(
          `event: content_block_delta\ndata: ${JSON.stringify({
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: errMsgForClient },
          })}\n\n`
        )
      );
      // Close content block
      controller.enqueue(
        encoder.encode(
          `event: content_block_stop\ndata: ${JSON.stringify({
            type: "content_block_stop",
            index: 0,
          })}\n\n`
        )
      );
      // Message delta with usage
      controller.enqueue(
        encoder.encode(
          `event: message_delta\ndata: ${JSON.stringify({
            type: "message_delta",
            delta: { stop_reason: "end_turn", stop_sequence: null },
            usage: { input_tokens: 0, output_tokens: 0 },
          })}\n\n`
        )
      );
      // Message stop
      controller.enqueue(
        encoder.encode(
          `event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`
        )
      );
    } else {
      // OpenAI SSE: final chunk with error finish_reason + [DONE]
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            id: `chatcmpl_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [{ index: 0, delta: { content: errMsgForClient }, finish_reason: "error", logprobs: null }],
          })}\n\n`
        )
      );
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
    }
  } catch {
    // Controller already closed — ignore
  }
}
