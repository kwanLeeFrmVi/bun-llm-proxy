// Translates OpenAI Chat Completions format -> Vertex AI format.
// Vertex AI uses Gemini format with some incompatible fields stripped.
// Ported from open-sse/translator/request/openai-to-vertex.js

import { convertOpenAIRequestToGemini } from "../gemini/request.ts";

/**
 * Strip Vertex-incompatible fields from Gemini format:
 * 1. Remove `id` from functionCall and functionResponse (Vertex rejects these)
 * 2. Remove synthetic thoughtSignature parts
 * 3. Remove `stream` (Vertex uses endpoint path, not body field)
 */
function stripVertexIncompatibleFields(body: Record<string, unknown>): Record<string, unknown> {
  // Vertex AI controls streaming via endpoint (streamGenerateContent vs generateContent), not body
  delete body.stream;
  // Vertex AI uses model in URL path, not body — remove to avoid confusion
  delete body.model;

  if (!body.contents) return body;

  const contents = body.contents as Array<Record<string, unknown>>;
  for (const turn of contents) {
    if (!Array.isArray(turn.parts)) continue;

    // Remove synthetic thoughtSignature parts
    turn.parts = (turn.parts as Array<Record<string, unknown>>).filter(
      (p) => !(p.thoughtSignature !== undefined && p.text === "" && !p.thought),
    );

    for (const part of turn.parts as Array<Record<string, unknown>>) {
      // Strip id from functionCall
      if (part.functionCall && "id" in (part.functionCall as Record<string, unknown>)) {
        delete (part.functionCall as Record<string, unknown>).id;
      }
      // Strip id from functionResponse
      if (part.functionResponse && "id" in (part.functionResponse as Record<string, unknown>)) {
        delete (part.functionResponse as Record<string, unknown>).id;
      }
      // Strip thoughtSignature alongside functionCall
      if (part.functionCall && "thoughtSignature" in part) {
        delete part.thoughtSignature;
      }
    }
  }

  return body;
}

export function convertOpenAIRequestToVertex(
  modelName: string,
  inputRaw: Uint8Array,
  stream: boolean
): Uint8Array {
  // Get Gemini format first
  const geminiRaw = convertOpenAIRequestToGemini(modelName, inputRaw, stream);
  const gemini = JSON.parse(new TextDecoder().decode(geminiRaw)) as Record<string, unknown>;

  // Strip Vertex-incompatible fields
  const vertex = stripVertexIncompatibleFields(gemini);

  return new TextEncoder().encode(JSON.stringify(vertex));
}
