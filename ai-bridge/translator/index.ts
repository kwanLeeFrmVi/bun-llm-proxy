// Translator registry — maps source/target format pairs to translation functions.
// Written from scratch in TypeScript.

import { FORMATS } from "./formats.ts";
import { convertClaudeRequestToOpenAI } from "./claude/openai/request.ts";
import {
  convertOpenAIResponseToClaude,
  convertOpenAIResponseToClaudeNonStream,
  newState as newClaudeToOpenAIState,
} from "./claude/openai/response.ts";
import { convertOpenAIRequestToClaude } from "./openai/claude/request.ts";
import {
  convertClaudeResponseToOpenAI,
  convertClaudeResponseToOpenAINonStream,
  newState as newOpenAIToClaudeState,
} from "./openai/claude/response.ts";
import { convertClaudeRequestToOllama } from "./claude/ollama/request.ts";
import { convertOllamaRequestToClaude } from "./ollama/claude/request.ts";
import {
  convertOllamaResponseToClaude,
  convertOllamaResponseToClaudeNonStream,
  newState as newOllamaToClaudeState,
} from "./ollama/claude/response.ts";
import { convertOllamaRequestToOpenAI } from "./ollama/openai/request.ts";
import {
  convertOllamaResponseToOpenAI,
  convertOllamaResponseToOpenAINonStream,
  newState as newOllamaToOpenAIState,
} from "./ollama/openai/response.ts";
import { convertOpenAIRequestToOllama } from "./openai/ollama/request.ts";
import { convertGeminiRequestToOpenAI } from "./gemini/openai/request.ts";
import {
  convertGeminiResponseToOpenAI,
  convertGeminiResponseToOpenAINonStream,
  newState as newGeminiToOpenAIState,
} from "./gemini/openai/response.ts";
import { convertOpenAIRequestToGemini } from "./openai/gemini/request.ts";
import {
  convertOpenAIResponseToGemini,
  convertOpenAIResponseToGeminiNonStream,
  newState as newOpenAIToGeminiState,
} from "./openai/gemini/response.ts";
import { convertOpenAIRequestToKiro } from "./openai/kiro/request.ts";
import {
  convertKiroResponseToOpenAI,
  convertKiroResponseToOpenAINonStream,
  newState as newKiroToOpenAIState,
} from "./kiro/openai/response.ts";
import { convertOpenAIRequestToAntigravity } from "./openai/antigravity/request.ts";
import {
  convertAntigravityResponseToOpenAI,
  convertAntigravityResponseToOpenAINonStream,
  newState as newAntigravityToOpenAIState,
} from "./antigravity/openai/response.ts";
import { convertOpenAIRequestToVertex } from "./openai/vertex/request.ts";

// ─── Function signatures ────────────────────────────────────────────────────────

export type RequestTranslatorFn = (
  modelName: string,
  inputRaw: Uint8Array,
  stream: boolean
) => Uint8Array;

export type ResponseTranslatorFn = (
  ctx: unknown,
  modelName: string,
  originalRequestRaw: Uint8Array,
  requestRaw: Uint8Array,
  raw: Uint8Array,
  state: unknown
) => Uint8Array[];

export type ResponseNonStreamFn = (
  ctx: unknown,
  modelName: string,
  originalRequestRaw: Uint8Array,
  requestRaw: Uint8Array,
  raw: Uint8Array
) => Uint8Array;

// ─── Registry ──────────────────────────────────────────────────────────────────

const requestRegistry = new Map<string, RequestTranslatorFn>();
const stateFactoryRegistry = new Map<string, () => unknown>();
const responseRegistry = new Map<string, ResponseTranslatorFn>();
const responseNonStreamRegistry = new Map<string, ResponseNonStreamFn>();

// ─── Registration helper ─────────────────────────────────────────────────────────

function register(
  from: string,
  to: string,
  requestFn: RequestTranslatorFn | null,
  responseFn: ResponseTranslatorFn | null,
  responseNonStreamFn: ResponseNonStreamFn | null = null
): void {
  const key = `${from}:${to}`;
  if (requestFn) requestRegistry.set(key, requestFn);
  if (responseFn) responseRegistry.set(key, responseFn);
  if (responseNonStreamFn) responseNonStreamRegistry.set(key, responseNonStreamFn);
}

// ─── Identity (pass-through) ───────────────────────────────────────────────────

function identity(_modelName: string, raw: Uint8Array): Uint8Array {
  return raw;
}

function normalizeClaudeStreamingUsage(raw: Uint8Array): Uint8Array {
  try {
    const text = new TextDecoder().decode(raw).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (!text.startsWith("event:")) return raw;

    const lines = text.split("\n");
    const dataLineIndex = lines.findIndex((line) => line.startsWith("data: "));
    if (dataLineIndex === -1) return raw;

    const dataLine = lines[dataLineIndex];
    if (!dataLine) return raw;

    const parsed = JSON.parse(dataLine.slice(6)) as Record<string, unknown>;

    if (parsed.type === "message_delta" && (parsed.usage === undefined || parsed.usage === null)) {
      lines[dataLineIndex] = `data: ${JSON.stringify({
        ...parsed,
        usage: { input_tokens: 0, output_tokens: 0 },
      })}`;
      return new TextEncoder().encode(lines.join("\n"));
    }

    if (parsed.type === "message_start") {
      const message = parsed.message as Record<string, unknown> | undefined;
      if (message && (message.usage === undefined || message.usage === null)) {
        lines[dataLineIndex] = `data: ${JSON.stringify({
          ...parsed,
          message: {
            ...message,
            usage: { input_tokens: 0, output_tokens: 0 },
          },
        })}`;
        return new TextEncoder().encode(lines.join("\n"));
      }
    }
  } catch {
    return raw;
  }

  return raw;
}

function identityResponse(
  _ctx: unknown,
  _m: string,
  _o: Uint8Array,
  _r: Uint8Array,
  raw: Uint8Array
): Uint8Array[] {
  // For streaming, pass through as-is but ensure usage data is added if present
  return [normalizeClaudeStreamingUsage(raw)];
}

function identityResponseNS(
  _ctx: unknown,
  _m: string,
  _o: Uint8Array,
  _r: Uint8Array,
  raw: Uint8Array
): Uint8Array {
  // For non-streaming, ensure usage field exists with defaults if missing
  try {
    const text = new TextDecoder().decode(raw);
    const parsed = JSON.parse(text);
    // Only add usage to responses that have choices (valid chat completions)
    if (parsed.choices && Array.isArray(parsed.choices) && !parsed.usage) {
      parsed.usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
      return new TextEncoder().encode(JSON.stringify(parsed));
    }
    if (parsed.type === "message" && !parsed.usage) {
      parsed.usage = { input_tokens: 0, output_tokens: 0 };
      return new TextEncoder().encode(JSON.stringify(parsed));
    }
  } catch {
    // If parsing fails, return raw
  }
  return raw;
}

function registerIdentity(format: string): void {
  register(format, format, identity, identityResponse, identityResponseNS);
}

// ─── Initialize all pairs ───────────────────────────────────────────────────────

function init(): void {
  // Claude ↔ OpenAI
  // register(from, to, requestFn, responseFn, responseNonStreamFn)
  // Response translators convert FROM 'to' format BACK TO 'from' format
  register(
    FORMATS.CLAUDE,
    FORMATS.OPENAI,
    convertClaudeRequestToOpenAI,
    convertClaudeResponseToOpenAI as ResponseTranslatorFn,
    convertClaudeResponseToOpenAINonStream as ResponseNonStreamFn
  );
  register(
    FORMATS.OPENAI,
    FORMATS.CLAUDE,
    convertOpenAIRequestToClaude,
    convertOpenAIResponseToClaude as ResponseTranslatorFn,
    convertOpenAIResponseToClaudeNonStream as ResponseNonStreamFn
  );

  // Claude ↔ Ollama
  register(
    FORMATS.CLAUDE,
    FORMATS.OLLAMA,
    convertClaudeRequestToOllama,
    identityResponse,
    identityResponseNS
  );
  register(
    FORMATS.OLLAMA,
    FORMATS.CLAUDE,
    convertOllamaRequestToClaude,
    convertOllamaResponseToClaude as ResponseTranslatorFn,
    convertOllamaResponseToClaudeNonStream as ResponseNonStreamFn
  );

  // Ollama <-> OpenAI (request formats are similar, but response needs translation)
  register(
    FORMATS.OLLAMA,
    FORMATS.OPENAI,
    convertOllamaRequestToOpenAI,
    convertOllamaResponseToOpenAI as ResponseTranslatorFn,
    convertOllamaResponseToOpenAINonStream as ResponseNonStreamFn
  );
  register(
    FORMATS.OPENAI,
    FORMATS.OLLAMA,
    convertOpenAIRequestToOllama,
    identityResponse,
    identityResponseNS
  );

  // Gemini ↔ OpenAI
  register(
    FORMATS.GEMINI,
    FORMATS.OPENAI,
    convertGeminiRequestToOpenAI,
    convertGeminiResponseToOpenAI as ResponseTranslatorFn,
    convertGeminiResponseToOpenAINonStream as ResponseNonStreamFn
  );
  register(
    FORMATS.OPENAI,
    FORMATS.GEMINI,
    convertOpenAIRequestToGemini,
    convertOpenAIResponseToGemini as ResponseTranslatorFn,
    convertOpenAIResponseToGeminiNonStream as ResponseNonStreamFn
  );

  // Kiro → OpenAI (AWS CodeWhisperer format)
  register(
    FORMATS.KIRO,
    FORMATS.OPENAI,
    null,
    convertKiroResponseToOpenAI as ResponseTranslatorFn,
    convertKiroResponseToOpenAINonStream as ResponseNonStreamFn
  );
  register(FORMATS.OPENAI, FORMATS.KIRO, convertOpenAIRequestToKiro, null, null);

  // Antigravity → OpenAI (Gemini-like format with outer wrapper)
  register(
    FORMATS.ANTIGRAVITY,
    FORMATS.OPENAI,
    null,
    convertAntigravityResponseToOpenAI as ResponseTranslatorFn,
    convertAntigravityResponseToOpenAINonStream as ResponseNonStreamFn
  );
  register(FORMATS.OPENAI, FORMATS.ANTIGRAVITY, convertOpenAIRequestToAntigravity, null, null);

  // Vertex → OpenAI (Gemini format with stripped fields)
  register(FORMATS.OPENAI, FORMATS.VERTEX, convertOpenAIRequestToVertex, null, null);
  // Vertex responses use Gemini format, so VERTEX -> OPENAI uses Gemini translator
  register(
    FORMATS.VERTEX,
    FORMATS.OPENAI,
    null,
    convertGeminiResponseToOpenAI as ResponseTranslatorFn,
    convertGeminiResponseToOpenAINonStream as ResponseNonStreamFn
  );

  // State factory registry — maps response translator keys to their initial state factories
  stateFactoryRegistry.set(`${FORMATS.CLAUDE}:${FORMATS.OPENAI}`, newClaudeToOpenAIState);
  stateFactoryRegistry.set(`${FORMATS.OPENAI}:${FORMATS.CLAUDE}`, newOpenAIToClaudeState);
  stateFactoryRegistry.set(`${FORMATS.OLLAMA}:${FORMATS.CLAUDE}`, newOllamaToClaudeState);
  stateFactoryRegistry.set(`${FORMATS.OLLAMA}:${FORMATS.OPENAI}`, newOllamaToOpenAIState);
  stateFactoryRegistry.set(`${FORMATS.GEMINI}:${FORMATS.OPENAI}`, newGeminiToOpenAIState);
  stateFactoryRegistry.set(`${FORMATS.OPENAI}:${FORMATS.GEMINI}`, newOpenAIToGeminiState);
  stateFactoryRegistry.set(`${FORMATS.KIRO}:${FORMATS.OPENAI}`, newKiroToOpenAIState);
  stateFactoryRegistry.set(`${FORMATS.ANTIGRAVITY}:${FORMATS.OPENAI}`, newAntigravityToOpenAIState);
  stateFactoryRegistry.set(`${FORMATS.VERTEX}:${FORMATS.OPENAI}`, newGeminiToOpenAIState);

  // Identity (pass-through) pairs
  registerIdentity(FORMATS.OPENAI);
  registerIdentity(FORMATS.OPENAI_RESPONSES);
  registerIdentity(FORMATS.CLAUDE);
  registerIdentity(FORMATS.GEMINI);
  registerIdentity(FORMATS.GEMINI_CLI); // Same as GEMINI
  registerIdentity(FORMATS.VERTEX); // Response same as GEMINI
  registerIdentity(FORMATS.CODEX); // OpenAI-compatible
  registerIdentity(FORMATS.CURSOR); // OpenAI-compatible
  registerIdentity(FORMATS.OLLAMA);
}

init();

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * Create the initial translator state for a given format pair.
 * Call once before streaming starts; pass the returned object on every
 * translateChunk call so the translator mutates it in-place across chunks.
 */
export function initState(from: string, to: string): unknown {
  const key = `${from}:${to}`;
  return stateFactoryRegistry.get(key)?.() ?? undefined;
}

export function Request(
  from: string,
  to: string,
  modelName: string,
  inputRaw: Uint8Array,
  stream: boolean
): Uint8Array {
  const key = `${from}:${to}`;
  const fn = requestRegistry.get(key);
  return fn ? fn(modelName, inputRaw, stream) : inputRaw;
}

export function Response(
  from: string,
  to: string,
  ctx: unknown,
  modelName: string,
  originalRequestRaw: Uint8Array,
  requestRaw: Uint8Array,
  raw: Uint8Array,
  state: unknown
): Uint8Array[] {
  const key = `${from}:${to}`;
  const fn = responseRegistry.get(key);
  return fn ? fn(ctx, modelName, originalRequestRaw, requestRaw, raw, state) : [raw];
}

export function ResponseNonStream(
  from: string,
  to: string,
  ctx: unknown,
  modelName: string,
  originalRequestRaw: Uint8Array,
  requestRaw: Uint8Array,
  raw: Uint8Array
): Uint8Array {
  const key = `${from}:${to}`;
  const fn = responseNonStreamRegistry.get(key);
  return fn ? fn(ctx, modelName, originalRequestRaw, requestRaw, raw) : raw;
}

export function NeedsTranslation(from: string, to: string): boolean {
  return from !== to;
}

export function initTranslators(): void {
  // No-op: all pairs are initialized statically
}

// Re-export types
export type { StreamingState } from "./claude/openai/response.ts";
export type { OpenAIStreamingState } from "./openai/claude/response.ts";
export type { OllamaStreamingState } from "./ollama/claude/response.ts";
export type { GeminiStreamingState } from "./gemini/openai/response.ts";
export type { OpenAIGeminiState } from "./openai/gemini/response.ts";
