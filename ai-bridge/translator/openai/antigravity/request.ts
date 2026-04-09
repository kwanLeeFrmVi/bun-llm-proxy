// Translates OpenAI Chat Completions format -> Antigravity format.
// Antigravity uses Gemini-like format wrapped in an outer request object.
// Reuses Gemini translator for core conversion.

import { convertOpenAIRequestToGemini } from "../gemini/request.ts";

export function convertOpenAIRequestToAntigravity(
  modelName: string,
  inputRaw: Uint8Array,
  stream: boolean,
  credentials?: Record<string, unknown>
): Uint8Array {
  // Get Gemini format first
  const geminiRaw = convertOpenAIRequestToGemini(modelName, inputRaw, stream);
  const gemini = JSON.parse(new TextDecoder().decode(geminiRaw)) as Record<string, unknown>;

  // Wrap in Antigravity outer structure
  const payload: Record<string, unknown> = {
    request: {
      ...gemini,
      sessionId: credentials?.sessionId ?? crypto.randomUUID(),
    },
    requestId: crypto.randomUUID(),
    sessionId: credentials?.sessionId ?? crypto.randomUUID(),
  };

  return new TextEncoder().encode(JSON.stringify(payload));
}
