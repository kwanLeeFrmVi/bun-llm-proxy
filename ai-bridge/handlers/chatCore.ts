// Core streaming chat handler — written from scratch in TypeScript.
// Handles the full lifecycle: translate request → upstream fetch → translate response → stream back.

import { Request, NeedsTranslation, ResponseNonStream } from "../translator/index.ts";
import { HTTP_STATUS } from "../config/runtimeConfig.ts";
import { PROVIDER_ID_TO_ALIAS, getModelTargetFormat } from "../config/providerModels.ts";
import { detectFormat, getTargetFormat, buildUpstreamUrl, buildUpstreamHeaders } from "./provider.js";
import { errorResponse } from "../utils/error.ts";
import * as log from "../../lib/logger.ts";
import type { RequestContext } from "../../lib/requestContext.ts";

export interface ChatCoreOptions {
  ctx?: RequestContext;
  body: Record<string, unknown>;
  modelInfo: { provider: string; model: string };
  credentials: Record<string, unknown>;
  clientRawRequest?: { endpoint: string; body: Record<string, unknown>; headers: Record<string, string> };
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
  const stream = streamProvider ? true : (body.stream !== false);

  log.debug(ctx ?? null, "CHAT", `${sourceFormat} → ${targetFormat} | stream=${stream}`);

  // Translate request body
  const bodyBytes = new TextEncoder().encode(JSON.stringify(body));
  const translatedBytes = NeedsTranslation(sourceFormat, targetFormat)
    ? Request(sourceFormat, targetFormat, model, bodyBytes, stream !== false)
    : bodyBytes;

  const translatedBody = JSON.parse(new TextDecoder().decode(translatedBytes)) as Record<string, unknown>;
  // Vertex AI (Gemini format) uses model in URL path, not body — skip setting model field
  // vertex-partner uses OpenAI-compatible endpoint which needs model in body
  if (provider !== "vertex") {
    translatedBody.model = model;
  }

  // Build upstream URL and headers
  const upstreamUrl = buildUpstreamUrl(provider, model, stream !== false, credentials);
  if (!upstreamUrl) {
    const errorMsg = `Unknown provider: ${provider}`;
    return { success: false, status: HTTP_STATUS.BAD_REQUEST, error: errorMsg, response: errorResponse(HTTP_STATUS.BAD_REQUEST, errorMsg) };
  }

  const headers = buildUpstreamHeaders(provider, credentials);

  // Calculate message count for upstream logging
  const messages = (body.messages as unknown[] | undefined)?.length ?? (body.input as unknown[] | undefined)?.length ?? 0;

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
      return { success: false, status: upstream.status, error: errorMsg, response: errorResponse(upstream.status, `Provider ${provider} returned ${upstream.status}: ${errorMsg}`) };
    }

    if (stream) {
      const response = await handleStreamingResponse(upstream, sourceFormat, targetFormat, model, translatedBytes, opts);
      opts.onRequestSuccess?.().catch(() => {});
      return { success: true, response };
    } else {
      const responseBody = await upstream.text();
      const translated = NeedsTranslation(targetFormat, sourceFormat)
        ? ResponseNonStream(targetFormat, sourceFormat, null, model, translatedBytes, translatedBytes, new TextEncoder().encode(responseBody))
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
      } catch { /* non-JSON response, skip usage */ }

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
      return { success: false, status: HTTP_STATUS.GATEWAY_TIMEOUT, error: timeoutMsg, response: errorResponse(HTTP_STATUS.GATEWAY_TIMEOUT, timeoutMsg) };
    }
    log.error(ctx ?? null, "CHAT", `Upstream error: ${msg}`);
    return { success: false, status: HTTP_STATUS.BAD_GATEWAY, error: msg, response: errorResponse(HTTP_STATUS.BAD_GATEWAY, msg) };
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

  let state: unknown = undefined;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          let raw = value instanceof Uint8Array ? value : new Uint8Array(value as ArrayBuffer);

          // Vertex AI (Gemini format) streaming returns JSON array: [{obj},{obj},...]
          // Strip array delimiters and split into individual JSON objects for the translator
          if (opts.modelInfo.provider === "vertex") {
            const text = new TextDecoder().decode(raw);
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
              const chunkRaw = new TextEncoder().encode(jsonStr);
              const translated = translateChunk(targetFormat, sourceFormat, model, translatedBytes, chunkRaw, state);
              state = translated.state;
              for (const chunk of translated.chunks) {
                controller.enqueue(chunk);
              }
            }
            continue;
          }

          const translated = translateChunk(targetFormat, sourceFormat, model, translatedBytes, raw, state);
          state = translated.state;

          for (const chunk of translated.chunks) {
            controller.enqueue(chunk);
          }
        }

        // Normal completion: flush done events
        const doneChunks = translateChunk(targetFormat, sourceFormat, model, translatedBytes, encoder.encode("data: [DONE]"), state);
        for (const chunk of doneChunks.chunks) {
          controller.enqueue(chunk);
        }

        controller.close();
      } catch (streamErr) {
        // Flush stop events so the client gets at least a partial signal
        // (message_delta + message_stop) before the error, preventing crashes
        // on missing input_tokens when the upstream connection drops mid-stream.
        if (state !== undefined) {
          try {
            const doneChunks = translateChunk(targetFormat, sourceFormat, model, translatedBytes, encoder.encode("data: [DONE]"), state);
            for (const chunk of doneChunks.chunks) {
              controller.enqueue(chunk);
            }
          } catch { /* ignore flush errors */ }
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
      "Connection": "keep-alive",
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
  const { Response: translate } = require("../translator/index.ts") as { Response: (from: string, to: string, ctx: unknown, modelName: string, origReq: Uint8Array, req: Uint8Array, raw: Uint8Array, state: unknown) => Uint8Array[] };

  const chunks = translate(sourceFormat, targetFormat, null, model, requestBytes, requestBytes, raw, state);
  const newState = chunks.length > 0 ? chunks[chunks.length - 1] : state;
  return { chunks, state: newState };
}

// ─── Error handling ─────────────────────────────────────────────────────────────

function handleUpstreamError(status: number, errorText: string, provider: string): ChatCoreResult | null {
  if (status === 401 || status === 403) {
    const errorMsg = "Authentication failed";
    return { success: false, status, error: errorMsg, response: errorResponse(status, `Provider ${provider}: ${errorMsg}`) };
  }
  if (status === 429) {
    const errorMsg = `Rate limited: ${errorText}`;
    return { success: false, status, error: errorMsg, response: errorResponse(status, `Provider ${provider}: ${errorMsg}`) };
  }
  if (status >= 500) {
    const errorMsg = `Upstream error: ${status}`;
    return { success: false, status, error: errorMsg, response: errorResponse(status, `Provider ${provider}: ${errorMsg}`) };
  }
  return null;
}
