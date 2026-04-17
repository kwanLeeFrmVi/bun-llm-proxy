// Core streaming chat handler — written from scratch in TypeScript.
// Handles the full lifecycle: translate request → upstream fetch → translate response → stream back.

import { Request, NeedsTranslation, ResponseNonStream, initState } from "../translator/index.ts";
import { HTTP_STATUS } from "../config/runtimeConfig.ts";
import { PROVIDER_ID_TO_ALIAS, getModelTargetFormat } from "../config/providerModels.ts";
import {
  detectFormat,
  getTargetFormat,
  buildUpstreamUrl,
  buildUpstreamHeaders,
} from "./provider.js";
import { errorResponse, sseErrorResponse } from "../utils/error.ts";
import * as log from "../../lib/logger.ts";
import type { RequestContext } from "../../lib/requestContext.ts";

export interface ChatCoreOptions {
  ctx?: RequestContext;
  body: Record<string, unknown>;
  modelInfo: { provider: string; model: string };
  credentials: Record<string, unknown>;
  clientRawRequest?: {
    endpoint: string;
    body: Record<string, unknown>;
    headers: Record<string, string>;
  };
  connectionId?: string;
  userAgent?: string;
  apiKey?: string | null;
  sourceFormatOverride?: string;
  onCredentialsRefreshed?: (creds: Record<string, unknown>) => Promise<void>;
  onRequestSuccess?: () => Promise<void>;
  onDisconnect?: (reason: string) => void;
  onStreamError?: (status: number, message: string) => Response;
  onUsage?: (usage: {
    prompt_tokens?: number;
    completion_tokens?: number;
    reasoning_tokens?: number;
    cached_tokens?: number;
  }) => Promise<void>;
}

export interface ChatCoreResult {
  success: boolean;
  response?: Response;
  status?: number;
  error?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    reasoning_tokens?: number;
    cached_tokens?: number;
  };
}

export async function handleChatCore(opts: ChatCoreOptions): Promise<ChatCoreResult> {
  const { body, modelInfo, credentials, ctx, sourceFormatOverride } = opts;
  const { provider, model } = modelInfo;

  // Detect source format
  const sourceFormat = sourceFormatOverride ?? (body._sourceFormat as string) ?? detectFormat(body);

  // Determine target format
  const alias = PROVIDER_ID_TO_ALIAS[provider] ?? provider;
  const modelTargetFormat = getModelTargetFormat(alias, model);
  const targetFormat = modelTargetFormat ?? getTargetFormat(provider);

  // Determine streaming mode (default: false, matching OpenAI API behavior)
  const stream = body.stream === true;

  log.debug(ctx ?? null, "CHAT", `${sourceFormat} → ${targetFormat} | stream=${stream}`);

  // Translate request body
  const bodyBytes = new TextEncoder().encode(JSON.stringify(body));
  const translatedBytes = NeedsTranslation(sourceFormat, targetFormat)
    ? Request(sourceFormat, targetFormat, model, bodyBytes, stream !== false)
    : bodyBytes;

  const translatedBody = JSON.parse(new TextDecoder().decode(translatedBytes)) as Record<
    string,
    unknown
  >;
  // Vertex AI (Gemini format) uses model in URL path, not body — skip setting model field
  // vertex-partner uses OpenAI-compatible endpoint which needs model in body
  if (provider !== "vertex") {
    translatedBody.model = model;
  }

  // Build upstream URL and headers
  const upstreamUrl = buildUpstreamUrl(provider, model, stream !== false, credentials);
  if (!upstreamUrl) {
    const errorMsg = `Unknown provider: ${provider}`;
    return {
      success: false,
      status: HTTP_STATUS.BAD_REQUEST,
      error: errorMsg,
      response: errorResponse(HTTP_STATUS.BAD_REQUEST, errorMsg),
    };
  }

  const headers = buildUpstreamHeaders(provider, credentials);

  // Calculate message count for upstream logging
  const messages =
    (body.messages as unknown[] | undefined)?.length ??
    (body.input as unknown[] | undefined)?.length ??
    0;

  log.debug(ctx ?? null, "CHAT", `${provider.toUpperCase()} → ${upstreamUrl}`);
  log.info(ctx ?? null, "REQUEST", `${provider.toUpperCase()} | ${model} | ${messages} msgs`);
  log.upstream(ctx ?? null, "POST", upstreamUrl, `${messages} msgs`);

  // NVIDIA NIM models can be very slow — allow 5 minutes before timing out
  const TIMEOUT_MS = provider === "nvidia" ? 300_000 : 120_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers,
      body: new TextEncoder().encode(JSON.stringify(translatedBody)),
      signal: controller.signal,
    });

    if (!upstream.ok) {
      const errorText = await upstream.text().catch(() => "");
      const errResult = handleUpstreamError(upstream.status, errorText, provider);
      if (errResult) return errResult;
      // Log the raw upstream error body for debugging (helps diagnose 400s from providers)
      log.warn(ctx ?? null, "UPSTREAM", `[${provider}] HTTP ${upstream.status}: ${errorText}`);
      const errorMsg = errorText || `Upstream error: ${upstream.status}`;
      return {
        success: false,
        status: upstream.status,
        error: errorMsg,
        response: errorResponse(
          upstream.status,
          `Provider ${provider} returned ${upstream.status}: ${errorMsg}`
        ),
      };
    }

    if (stream) {
      const response = await handleStreamingResponse(
        upstream,
        sourceFormat,
        targetFormat,
        model,
        translatedBytes,
        opts
      );
      opts.onRequestSuccess?.().catch((e) => {
        log.debug(ctx ?? null, "CHAT", `onRequestSuccess callback failed: ${e instanceof Error ? e.message : String(e)}`);
      });
      return { success: true, response };
    } else {
      const responseBody = await upstream.text();
      const translated = NeedsTranslation(targetFormat, sourceFormat)
        ? ResponseNonStream(
            targetFormat,
            sourceFormat,
            null,
            model,
            translatedBytes,
            translatedBytes,
            new TextEncoder().encode(responseBody)
          )
        : new TextEncoder().encode(responseBody);

      // Extract usage from non-streaming response
      let usageData: {
        prompt_tokens?: number;
        completion_tokens?: number;
        reasoning_tokens?: number;
        cached_tokens?: number;
      } = {};
      try {
        const parsed = JSON.parse(responseBody);
        if (parsed.usage) {
          usageData = {
            prompt_tokens: parsed.usage.prompt_tokens ?? parsed.usage.input_tokens,
            completion_tokens: parsed.usage.completion_tokens ?? parsed.usage.output_tokens,
            reasoning_tokens: parsed.usage.reasoning_tokens ?? parsed.usage.thinking_tokens,
            cached_tokens: parsed.usage.prompt_tokens_details?.cached_tokens,
          };
        }
      } catch (e) {
        log.debug(ctx ?? null, "USAGE", `Non-JSON response body, skipping usage extraction: ${e instanceof Error ? e.message : String(e)}`);
      }

      const response = new globalThis.Response(translated, {
        status: upstream.status || 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
      });

      opts.onRequestSuccess?.().catch((e) => {
        log.debug(ctx ?? null, "CHAT", `onRequestSuccess callback failed: ${e instanceof Error ? e.message : String(e)}`);
      });
      opts.onUsage?.(usageData).catch((e) => {
        log.debug(ctx ?? null, "CHAT", `onUsage callback failed: ${e instanceof Error ? e.message : String(e)}`);
      });
      return { success: true, response };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Detect abort (timeout) vs. other errors
    if (msg === "The operation was aborted" || msg === "aborted") {
      log.error(ctx ?? null, "CHAT", `Request timed out after ${TIMEOUT_MS / 1000}s`);
      const timeoutMsg = `Request timed out after ${TIMEOUT_MS / 1000}s`;
      return {
        success: false,
        status: HTTP_STATUS.GATEWAY_TIMEOUT,
        error: timeoutMsg,
        response: errorResponse(HTTP_STATUS.GATEWAY_TIMEOUT, timeoutMsg),
      };
    }
    log.error(ctx ?? null, "CHAT", `Upstream error: ${msg}`);
    return {
      success: false,
      status: HTTP_STATUS.BAD_GATEWAY,
      error: msg,
      response: errorResponse(HTTP_STATUS.BAD_GATEWAY, msg),
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Streaming response ───────────────────────────────────────────────────────────

/**
 * Split a string containing multiple JSON objects separated by commas.
 * Handles formats like: {"a":1},{"b":2} or {"a":1},\r\n{"b":2}
 */
function splitVertexJsonObjects(text: string): string[] {
  const results: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (text[i] === "}") {
      depth--;
      if (depth === 0) {
        results.push(text.slice(start, i + 1));
      }
    }
  }

  return results;
}

async function handleStreamingResponse(
  upstream: Response,
  sourceFormat: string,
  targetFormat: string,
  model: string,
  translatedBytes: Uint8Array,
  opts: ChatCoreOptions
): Promise<Response> {
  if (!upstream.body) {
    return new globalThis.Response("Upstream returned empty body", { status: 502 });
  }

  if (!upstream.ok) {
    const errorText = await upstream.text().catch(() => "");
    const status = upstream.status;
    const msg = errorText || `Upstream error: ${status}`;
    log.warn(opts.ctx ?? null, "UPSTREAM", `[${opts.modelInfo.provider}] HTTP ${status}: ${errorText}`);
    log.warn(opts.ctx ?? null, "STREAM", `Upstream error ${status}: ${msg}`);
    if (opts.onStreamError) return opts.onStreamError(status, msg);
    return sseErrorResponse(status, msg);
  }

  // Initialize translator state once; the translator mutates this object in-place
  // across every chunk, preserving accumulated context (messageId, block indexes, etc.).
  let state: unknown = initState(targetFormat, sourceFormat);
  const encoder = new TextEncoder();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let sseBuffer = "";
  // Ollama (and similar) send NDJSON (one JSON object per line) instead of SSE
  const isSSE = targetFormat !== "ollama";
  let ndjsonBuffer = "";
  let sawValidMessageDelta = false;
  let chunkCount = 0;
  let eventCount = 0;

  // ── Diagnostic tracking ──────────────────────────────────────────────────────
  // These fields help distinguish normal completion from premature close so the
  // next incident can be diagnosed from logs alone without needing to reproduce.
  const streamStartMs = Date.now();
  let firstUpstreamChunkMs: number | null = null; // when first TCP chunk arrived from upstream
  let firstTranslatedChunkMs: number | null = null; // when first translated chunk was enqueued
  let translatedChunkCount = 0; // how many translated chunks were successfully enqueued
  let downstreamCanceled = false; // set true when ReadableStream's cancel() fires
  // Possible close reasons: "normal" | "downstream_canceled" | "upstream_error" | "unknown"
  let closeReason: string = "unknown";

  // ── anthropic-compatible-* SSE shape validation ──────────────────────────────
  // When the source and target format are both "claude" (identity passthrough),
  // verify the first real SSE data event is actually Claude-format.
  // If the upstream is returning OpenAI-format events instead, we log a clear
  // warning immediately rather than letting the client see garbage silently.
  const isClaudeIdentityPassthrough = sourceFormat === "claude" && targetFormat === "claude";
  let firstSseDataValidated = false; // fire once on the first parseable data: line

  log.debug(
    opts.ctx ?? null,
    "STREAM",
    `Starting stream: ${sourceFormat} → ${targetFormat} | provider=${opts.modelInfo.provider} | isSSE=${isSSE}`
  );

  // AbortController shared between cancel() and start() so that downstream
  // disconnect immediately stops the upstream reader loop.
  const streamAbort = new AbortController();

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      let controllerClosed = false;
      const safeEnqueue = (chunk: Uint8Array) => {
        if (!controllerClosed) {
          try {
            const now = Date.now();
            if (firstTranslatedChunkMs === null) firstTranslatedChunkMs = now;
            translatedChunkCount++;
            controller.enqueue(chunk);
          } catch (enqueueErr) {
            // Controller may already be closed by cancel() — swallow silently.
            // This is expected when the downstream client disconnects mid-stream.
            log.debug(opts.ctx ?? null, "STREAM", `safeEnqueue: controller.enqueue failed (downstream closed): ${enqueueErr instanceof Error ? enqueueErr.message : String(enqueueErr)}`);
          }
        }
      };
      const safeClose = () => {
        if (!controllerClosed) {
          controllerClosed = true;
          try {
            controller.close();
          } catch (closeErr) {
            log.debug(opts.ctx ?? null, "STREAM", `safeClose: controller.close failed (already closed): ${closeErr instanceof Error ? closeErr.message : String(closeErr)}`);
          }
        }
      };

      try {
        while (true) {
          // Check abort flag before each read — cancel() may have fired between chunks
          if (streamAbort.signal.aborted) break;
          const { done, value } = await reader.read();
          if (done) break;

          if (firstUpstreamChunkMs === null) firstUpstreamChunkMs = Date.now();

          const raw = value instanceof Uint8Array ? value : new Uint8Array(value as ArrayBuffer);
          chunkCount++;

          // Vertex AI (Gemini format) streaming returns JSON array: [{obj},{obj},...]
          // Strip array delimiters and split into individual JSON objects for the translator
          if (opts.modelInfo.provider === "vertex") {
            const text = decoder.decode(raw, { stream: true });
            let cleaned = text.trim();
            if (cleaned === "]" || cleaned === "]\r\n") continue;
            if (cleaned.startsWith("[")) cleaned = cleaned.slice(1);
            if (cleaned.startsWith(",")) cleaned = cleaned.slice(1);
            if (cleaned.endsWith("]")) cleaned = cleaned.slice(0, -1);
            cleaned = cleaned.trim();
            if (!cleaned) continue;

            // Split multiple JSON objects: },{ or },\r\n{ or },\n{
            const jsonObjects = splitVertexJsonObjects(cleaned);

            for (const jsonStr of jsonObjects) {
              const chunkRaw = encoder.encode(jsonStr);
              const translated = translateChunk(
                targetFormat,
                sourceFormat,
                model,
                translatedBytes,
                chunkRaw,
                state
              );
              state = translated.state;
              for (const chunk of translated.chunks) {
                safeEnqueue(chunk);
              }
            }
            continue;
          }

          // NDJSON line buffering (Ollama and similar): each line is a JSON object
          if (!isSSE) {
            const text = decoder.decode(raw, { stream: true });
            ndjsonBuffer += text;
            while (ndjsonBuffer.includes("\n")) {
              const lineEnd = ndjsonBuffer.indexOf("\n");
              const line = ndjsonBuffer.slice(0, lineEnd);
              ndjsonBuffer = ndjsonBuffer.slice(lineEnd + 1);
              if (!line.trim()) continue;
              const lineRaw = encoder.encode(line);
              const translated = translateChunk(
                targetFormat,
                sourceFormat,
                model,
                translatedBytes,
                lineRaw,
                state
              );
              state = translated.state;
              for (const chunk of translated.chunks) {
                // Track message_delta in NDJSON-translated chunks (mirrors SSE path below)
                if (!sawValidMessageDelta) {
                  const chunkText = decoder.decode(chunk, { stream: false });
                  if (chunkText.includes('"type":"message_delta"') && chunkText.includes('"usage"')) {
                    sawValidMessageDelta = true;
                  }
                }
                safeEnqueue(chunk);
              }
            }
            continue;
          }

          // SSE line buffering: accumulate text and only process complete SSE events
          // (delimited by \n\n). This prevents split TCP chunks from breaking JSON parsing.
          // Normalize \r\n → \n so that \r\n\r\n event separators become \n\n
          const text = decoder
            .decode(raw, { stream: true })
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n");
          sseBuffer += text;

          // Process complete SSE events (each ends with \n\n)
          while (sseBuffer.includes("\n\n")) {
            const eventEnd = sseBuffer.indexOf("\n\n");
            const eventText = sseBuffer.slice(0, eventEnd + 2);
            sseBuffer = sseBuffer.slice(eventEnd + 2);
            eventCount++;

            // ── anthropic-compatible-* SSE shape validation (fires once) ────────
            // For claude→claude identity passthrough, validate the first real data
            // event is Claude-format (has "type" field). If the upstream returns
            // OpenAI-format events instead, emit a clear warning immediately.
            if (isClaudeIdentityPassthrough && !firstSseDataValidated) {
              const dataMatch = eventText.match(/^data:\s*(.+)$/m);
              if (dataMatch && dataMatch[1] !== "[DONE]") {
                firstSseDataValidated = true;
                try {
                  const parsed = JSON.parse(dataMatch[1]!);
                  if (parsed !== null && typeof parsed === "object") {
                    const isClaudeShape =
                      "type" in parsed &&
                      typeof (parsed as Record<string, unknown>).type === "string";
                    const isOpenAIShape = "choices" in parsed || "object" in parsed;
                    if (!isClaudeShape || isOpenAIShape) {
                      log.warn(
                        opts.ctx ?? null,
                        "STREAM",
                        `anthropic-compatible passthrough: upstream returned unexpected SSE shape ` +
                          `(isClaudeShape=${isClaudeShape}, isOpenAIShape=${isOpenAIShape}, ` +
                          `provider=${opts.modelInfo.provider}). ` +
                          `First event type=${String((parsed as Record<string, unknown>).type ?? "missing")}. ` +
                          `This may cause Claude Code to crash or see garbled output.`
                      );
                    } else {
                      log.debug(
                        opts.ctx ?? null,
                        "STREAM",
                        `anthropic-compatible passthrough: first SSE event shape OK ` +
                          `(type=${(parsed as Record<string, unknown>).type}, ` +
                          `provider=${opts.modelInfo.provider})`
                      );
                    }
                  }
                } catch (e) {
                  log.debug(opts.ctx ?? null, "STREAM", `SSE shape validation: non-JSON first event (may be comment/keep-alive): ${e instanceof Error ? e.message : String(e)}`);
                }
              }
            }

            // Track whether we saw a valid message_delta with usage for fallback emission
            if (eventText.includes("message_delta")) {
              try {
                const dataMatch = eventText.match(/data:\s*(\{.*\})/);
                if (dataMatch) {
                  const parsed = JSON.parse(dataMatch[1]!);
                  if (parsed.type === "message_delta" && parsed.usage != null) {
                    sawValidMessageDelta = true;
                  }
                }
              } catch (e) {
                log.debug(opts.ctx ?? null, "STREAM", `message_delta tracking: JSON parse error: ${e instanceof Error ? e.message : String(e)}`);
              }
            }

            const eventRaw = encoder.encode(eventText);
            const translated = translateChunk(
              targetFormat,
              sourceFormat,
              model,
              translatedBytes,
              eventRaw,
              state
            );
            state = translated.state;
            for (const chunk of translated.chunks) {
              safeEnqueue(chunk);
            }
          }
        }

        // Process any remaining buffered data
        if (ndjsonBuffer.trim()) {
          const remainingRaw = encoder.encode(ndjsonBuffer.trim());
          const translated = translateChunk(
            targetFormat,
            sourceFormat,
            model,
            translatedBytes,
            remainingRaw,
            state
          );
          state = translated.state;
          for (const chunk of translated.chunks) {
            if (!sawValidMessageDelta) {
              const chunkText = decoder.decode(chunk, { stream: false });
              if (chunkText.includes('"type":"message_delta"') && chunkText.includes('"usage"')) {
                sawValidMessageDelta = true;
              }
            }
            safeEnqueue(chunk);
          }
          ndjsonBuffer = "";
        }
        if (sseBuffer.trim()) {
          const remainingRaw = encoder.encode(sseBuffer.trim());
          const translated = translateChunk(
            targetFormat,
            sourceFormat,
            model,
            translatedBytes,
            remainingRaw,
            state
          );
          state = translated.state;
          for (const chunk of translated.chunks) {
            safeEnqueue(chunk);
          }
          sseBuffer = "";
        }

        // Normal completion: flush done events.
        // Skip for claude source format — Claude SSE streams terminate with
        // `event: message_stop`, not `data: [DONE]` (that's OpenAI format).
        // Forwarding `data: [DONE]` to a Claude client (e.g. via identity
        // passthrough) causes the client to see an invalid terminator and
        // abort the socket ("socket connection was closed unexpectedly").
        if (sourceFormat !== "claude") {
          const doneChunks = translateChunk(
            targetFormat,
            sourceFormat,
            model,
            translatedBytes,
            encoder.encode("data: [DONE]"),
            state
          );
          for (const chunk of doneChunks.chunks) {
            // Ensure [DONE] event ends with \n\n so synthetic events
            // after it are properly separated in the SSE stream.
            const raw = decoder.decode(chunk, { stream: false });
            if (!raw.endsWith("\n\n")) {
              safeEnqueue(encoder.encode(raw + "\n\n"));
            } else {
              safeEnqueue(chunk);
            }
          }
        }

        // Guarantee message_delta with usage for Claude SSE clients that crash
        // on missing input_tokens (e.g. Claude Code). If the upstream never sent
        // a valid message_delta with usage, emit a synthetic fallback.
        if (!sawValidMessageDelta && sourceFormat === "claude") {
          log.debug(
            opts.ctx ?? null,
            "STREAM",
            "Emitting synthetic message_delta — upstream did not provide valid usage"
          );
          safeEnqueue(
            encoder.encode(
              "event: message_delta\n" +
                'data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"input_tokens":0,"output_tokens":0}}\n\n'
            )
          );
          safeEnqueue(
            encoder.encode("event: message_stop\n" + 'data: {"type":"message_stop"}\n\n')
          );
        }

        closeReason = "normal";
        const totalMs = Date.now() - streamStartMs;
        log.info(
          opts.ctx ?? null,
          "STREAM",
          `INNER complete: ${chunkCount} upstreamChunks, ${translatedChunkCount} translatedChunks, ` +
            `${eventCount} events, sawValidMessageDelta=${sawValidMessageDelta}, ` +
            `firstUpstreamChunkAfterMs=${firstUpstreamChunkMs != null ? firstUpstreamChunkMs - streamStartMs : "?"}, ` +
            `firstTranslatedAfterMs=${firstTranslatedChunkMs != null ? firstTranslatedChunkMs - streamStartMs : "?"}, ` +
            `closeReason=${closeReason}, totalMs=${totalMs}`
        );

        safeClose();
      } catch (streamErr) {
        // Propagate downstream cancellation to the inner reader so the upstream
        // fetch is aborted promptly rather than continuing to read in the background.
        try {
          reader.cancel();
        } catch (cancelErr) {
          log.debug(opts.ctx ?? null, "STREAM", `reader.cancel() failed (may already be done): ${cancelErr instanceof Error ? cancelErr.message : String(cancelErr)}`);
        }

        // Flush stop events so the client gets at least a partial signal
        // (message_delta + message_stop) before closing, preventing crashes
        // on missing input_tokens when the upstream connection drops mid-stream.
        // NOTE: use controller.close() instead of controller.error() — error()
        // closes the controller immediately and discards all enqueued chunks.
        if (state !== undefined && sourceFormat !== "claude") {
          // Skip for claude source — Claude SSE streams terminate with
          // `event: message_stop`, not `data: [DONE]`.
          try {
            const doneChunks = translateChunk(
              targetFormat,
              sourceFormat,
              model,
              translatedBytes,
              encoder.encode("data: [DONE]"),
              state
            );
            for (const chunk of doneChunks.chunks) {
              // Ensure [DONE] event ends with \n\n so synthetic events
              // after it are properly separated in the SSE stream.
              const raw = decoder.decode(chunk, { stream: false });
              if (!raw.endsWith("\n\n")) {
                safeEnqueue(encoder.encode(raw + "\n\n"));
              } else {
                safeEnqueue(chunk);
              }
            }
          } catch (flushErr) {
            log.debug(opts.ctx ?? null, "STREAM", `Failed to flush done chunks on stream error: ${flushErr instanceof Error ? flushErr.message : String(flushErr)}`);
          }
        }

        // Guarantee message_delta with usage for Claude SSE clients that crash
        // on missing input_tokens (e.g. Claude Code). When the upstream errors
        // mid-stream, the normal-completion path's synthetic message_delta never
        // runs, so we must emit it here too.
        if (!sawValidMessageDelta && sourceFormat === "claude") {
          safeEnqueue(
            encoder.encode(
              "event: message_delta\n" +
                'data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"input_tokens":0,"output_tokens":0}}\n\n'
            )
          );
          safeEnqueue(
            encoder.encode("event: message_stop\n" + 'data: {"type":"message_stop"}\n\n')
          );
        }
        const errMsg = streamErr instanceof Error ? streamErr.message : String(streamErr);
        const totalMs = Date.now() - streamStartMs;
        if (downstreamCanceled) {
          closeReason = "downstream_canceled";
          log.warn(
            opts.ctx ?? null,
            "STREAM",
            `INNER close (downstream_canceled): upstreamChunks=${chunkCount}, ` +
              `translatedChunks=${translatedChunkCount}, err=${errMsg}, totalMs=${totalMs}`
          );
        } else {
          closeReason = "upstream_error";
          // Enqueue a sentinel SSE comment so the outer stream (handlers/chat.ts)
          // can detect the upstream truncation and log OUTER_ERROR instead of
          // OUTER_COMPLETE. The comment is invisible to SSE clients (RFC 6762:
          // lines starting with ":" are comments), so it won't break any protocol.
          safeEnqueue(
            encoder.encode(`: __UPSTREAM_ERROR__: ${errMsg}\n\n`)
          );
          log.warn(
            opts.ctx ?? null,
            "STREAM",
            `INNER close (upstream_error): upstreamChunks=${chunkCount}, ` +
              `translatedChunks=${translatedChunkCount}, err=${errMsg}, totalMs=${totalMs}`
          );
        }
        safeClose();
      } finally {
        // Always log the final state so we can see what happened even if the
        // reason was set above (finally always runs after catch or try).
        if (closeReason === "unknown") {
          const totalMs = Date.now() - streamStartMs;
          log.warn(
            opts.ctx ?? null,
            "STREAM",
            `INNER close (unknown): upstreamChunks=${chunkCount}, ` +
              `translatedChunks=${translatedChunkCount}, totalMs=${totalMs}`
          );
        }
        reader.releaseLock();
      }
    },
    cancel() {
      downstreamCanceled = true;
      // Abort the upstream reader loop so it stops trying to enqueue into
      // the already-closed controller. Without this, the loop continues
      // reading upstream chunks until the upstream finishes or times out,
      // wasting bandwidth and producing "Controller is already closed" errors.
      streamAbort.abort();
      opts.onDisconnect?.("client_disconnected");
    },
  });

  return new globalThis.Response(stream, {
    status: upstream.status || 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

interface TranslateChunkResult {
  chunks: Uint8Array[];
  state: unknown;
}

function translateChunk(
  sourceFormat: string,
  targetFormat: string,
  model: string,
  requestBytes: Uint8Array,
  raw: Uint8Array,
  state: unknown
): TranslateChunkResult {
  // Import the Response function lazily to avoid circular dependency at module level
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Response: translate } = require("../translator/index.ts") as {
    Response: (
      from: string,
      to: string,
      ctx: unknown,
      modelName: string,
      origReq: Uint8Array,
      req: Uint8Array,
      raw: Uint8Array,
      state: unknown
    ) => Uint8Array[];
  };

  const chunks = translate(
    sourceFormat,
    targetFormat,
    null,
    model,
    requestBytes,
    requestBytes,
    raw,
    state
  );
  // Do NOT replace state with output chunks — translator functions mutate the state
  // object in-place via the `param` argument, so we preserve the same reference.
  // Previously this was `chunks[chunks.length - 1]` which corrupted state with a Uint8Array.
  return { chunks, state };
}

// ─── Error handling ─────────────────────────────────────────────────────────────

function handleUpstreamError(
  status: number,
  errorText: string,
  provider: string
): ChatCoreResult | null {
  if (status === 401 || status === 403) {
    const errorMsg = "Authentication failed";
    return {
      success: false,
      status,
      error: errorMsg,
      response: errorResponse(status, `Provider ${provider}: ${errorMsg}`),
    };
  }
  if (status === 429) {
    const errorMsg = `Rate limited: ${errorText}`;
    return {
      success: false,
      status,
      error: errorMsg,
      response: errorResponse(status, `Provider ${provider}: ${errorMsg}`),
    };
  }
  if (status >= 500) {
    const errorMsg = `Upstream error: ${status}`;
    return {
      success: false,
      status,
      error: errorMsg,
      response: errorResponse(status, `Provider ${provider}: ${errorMsg}`),
    };
  }
  return null;
}
