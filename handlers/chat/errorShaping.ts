import { sseErrorResponse, openaiSseErrorResponse, errorResponse } from "../../ai-bridge/utils/error.ts";
import { detectFormatByEndpoint } from "../../ai-bridge/translator/formats.ts";
import { detectFormat } from "../../ai-bridge/handlers/provider.ts";

function detectClientFormat(body: Record<string, unknown>, request: Request | null): string {
  const endpoint = request?.url ? new URL(request.url).pathname : "";
  return detectFormatByEndpoint(endpoint, body) ?? detectFormat(body);
}

function isClaudeStreamingClient(body: Record<string, unknown>, request: Request | null): boolean {
  if (body.stream !== true) return false;
  return detectClientFormat(body, request) === "claude";
}

/**
 * Return a format-appropriate error response.
 * - Claude streaming client → Anthropic SSE error event
 * - Any other streaming client → OpenAI-style SSE error chunk + [DONE]
 * - Non-streaming → plain JSON error
 */
export function formatAwareErrorResponse(
  body: Record<string, unknown>,
  request: Request | null,
  status: number,
  message: string
): Response {
  if (body.stream === true) {
    const fmt = detectClientFormat(body, request);
    if (fmt === "claude") return sseErrorResponse(status, message);
    return openaiSseErrorResponse(status, message);
  }
  return errorResponse(status, message) as Response;
}

export { isClaudeStreamingClient };
