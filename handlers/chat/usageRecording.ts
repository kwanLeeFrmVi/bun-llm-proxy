import { saveRequestUsage } from "../../stubs/usageDb.ts";

export function makeUsageCallback(
  requestId: string,
  startTime: number,
  provider: string,
  model: string,
  isStreaming: boolean
) {
  return async (usage: {
    prompt_tokens?: number;
    completion_tokens?: number;
    reasoning_tokens?: number;
    cached_tokens?: number;
  }) => {
    // Skip recording usage if we're in streaming mode, as the stream wrapper will
    // handle usage extraction and recording once the stream completes.
    if (isStreaming) return;

    const durMs = Date.now() - startTime;
    const completionTokens = usage.completion_tokens ?? 0;
    const tps = completionTokens > 0 && durMs > 0
      ? (completionTokens / durMs) * 1000
      : undefined;
    await saveRequestUsage(requestId, {
      ...usage,
      provider,
      model,
      ttft_ms: durMs,
      tokens_per_second: tps,
    }, durMs);
  };
}

export function makeStreamErrorCallback(
  sourceFormat: string,
  sseErrorResponse: (status: number, msg: string) => Response,
  openaiSseErrorResponse: (status: number, msg: string) => Response
) {
  return (status: number, msg: string) =>
    sourceFormat === "claude"
      ? sseErrorResponse(status, msg)
      : openaiSseErrorResponse(status, msg);
}
