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
import { errorResponse } from "../utils/error.ts";
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

const STREAM_PROVIDERS = new Set(["openai", "codex"]);

export async function handleChatCore(opts: ChatCoreOptions): Promise<ChatCoreResult> {
  const { body, modelInfo, credentials, ctx, sourceFormatOverride } = opts;
  const { provider, model } = modelInfo;

  // Detect source format
  const sourceFormat = sourceFormatOverride ?? (body._sourceFormat as string) ?? detectFormat(body);

  // Determine target format
  const alias = PROVIDER_ID_TO_ALIAS[provider] ?? provider;
  const modelTargetFormat = getModelTargetFormat(alias, model);
  const targetFormat = modelTargetFormat ?? getTargetFormat(provider);

  // Determine streaming mode
  const streamProvider = STREAM_PROVIDERS.has(provider);
  const stream = streamProvider ? true : body.stream !== false;

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
      // For other non-ok statuses, return a generic error (don't continue to read body again)
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
      opts.onRequestSuccess?.().catch(() => {});
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
      } catch {
        /* non-JSON response, skip usage */
      }

      const response = new globalThis.Response(translated, {
        status: upstream.status || 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
      });

      opts.onRequestSuccess?.().catch(() => {});
      opts.onUsage?.(usageData).catch(() => {});
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

  log.debug(opts.ctx ?? null, "STREAM", `Starting stream: ${sourceFormat} → ${targetFormat} | provider=${opts.modelInfo.provider} | isSSE=${isSSE}`);

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

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
                controller.enqueue(chunk);
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
                controller.enqueue(chunk);
              }
            }
            continue;
          }

          // SSE line buffering: accumulate text and only process complete SSE events
          // (delimited by \n\n). This prevents split TCP chunks from breaking JSON parsing.
          // Normalize \r\n → \n so that \r\n\r\n event separators become \n\n
          const text = decoder.decode(raw, { stream: true }).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
          sseBuffer += text;

          // Process complete SSE events (each ends with \n\n)
          while (sseBuffer.includes("\n\n")) {
            const eventEnd = sseBuffer.indexOf("\n\n");
            const eventText = sseBuffer.slice(0, eventEnd + 2);
            sseBuffer = sseBuffer.slice(eventEnd + 2);
            eventCount++;

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
              } catch { /* ignore parse errors in tracking */ }
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
              controller.enqueue(chunk);
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
            controller.enqueue(chunk);
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
            controller.enqueue(chunk);
          }
          sseBuffer = "";
        }

        // Normal completion: flush done events
        const doneChunks = translateChunk(
          targetFormat,
          sourceFormat,
          model,
          translatedBytes,
          encoder.encode("data: [DONE]"),
          state
        );
        for (const chunk of doneChunks.chunks) {
          controller.enqueue(chunk);
        }

        // Guarantee message_delta with usage for Claude SSE clients that crash
        // on missing input_tokens (e.g. Claude Code). If the upstream never sent
        // a valid message_delta with usage, emit a synthetic fallback.
        if (!sawValidMessageDelta && sourceFormat === "claude") {
          log.debug(opts.ctx ?? null, "STREAM", "Emitting synthetic message_delta — upstream did not provide valid usage");
          controller.enqueue(encoder.encode(
            "event: message_delta\n" +
            'data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"input_tokens":0,"output_tokens":0}}\n\n'
          ));
          controller.enqueue(encoder.encode(
            "event: message_stop\n" +
            'data: {"type":"message_stop"}\n\n'
          ));
        }

        log.debug(opts.ctx ?? null, "STREAM", `Stream complete: ${chunkCount} chunks, ${eventCount} events, sawValidMessageDelta=${sawValidMessageDelta}`);

        controller.close();
      } catch (streamErr) {
        // Flush stop events so the client gets at least a partial signal
        // (message_delta + message_stop) before the error, preventing crashes
        // on missing input_tokens when the upstream connection drops mid-stream.
        if (state !== undefined) {
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
              controller.enqueue(chunk);
            }
          } catch {
            /* ignore flush errors */
          }
        }
        controller.error(streamErr);
      } finally {
        reader.releaseLock();
      }
    },
    cancel() {
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
