import { describe, it, expect } from "bun:test";
import { createDiagnosticTransform } from "../../ai-bridge/utils/streamDiagnostics.ts";
import type { LogContext } from "../../lib/requestContext.ts";

describe("streamDiagnostics", () => {
  const UPSTREAM_ERROR_SENTINEL = ": __UPSTREAM_ERROR__:";

  const enc = new TextEncoder();

  /** Write chunks through the transform, consume readable, return output text + state */
  async function pipeThrough(
    chunks: Uint8Array[],
    ctx: LogContext = null
  ): Promise<{ output: string; getState: () => any }> {
    const { transform, getState } = createDiagnosticTransform({ startTime: Date.now(), ctx });
    const writer = transform.writable.getWriter();
    const reader = transform.readable.getReader();

    // Read all output in parallel with writes
    const outParts: string[] = [];
    const dec = new TextDecoder();
    const readDone = (async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        outParts.push(dec.decode(value));
      }
    })();

    for (const chunk of chunks) {
      await writer.write(chunk);
    }
    await writer.close();
    await readDone;

    return { output: outParts.join(""), getState };
  }

  it("should extract usage from OpenAI SSE chunks", async () => {
    const event = `data: ${JSON.stringify({ usage: { prompt_tokens: 10, completion_tokens: 20 } })}\n\n`;
    const { output, getState } = await pipeThrough([enc.encode(event)]);

    const state = getState();
    expect(state.finalUsage?.prompt_tokens).toBe(10);
    expect(state.finalUsage?.completion_tokens).toBe(20);
    expect(output).toContain("usage");
  });

  it("should extract usage from Claude SSE chunks", async () => {
    const event = `event: message_start\ndata: ${JSON.stringify({ message: { usage: { input_tokens: 5, output_tokens: 15 } } })}\n\n`;
    const { output, getState } = await pipeThrough([enc.encode(event)]);

    const state = getState();
    expect(state.finalUsage?.prompt_tokens).toBe(5);
    expect(state.finalUsage?.completion_tokens).toBe(15);
  });

  it("should handle multi-byte characters split across chunks (UTF-8 corruption fix)", async () => {
    // 🚀 is 4 bytes: [0xF0, 0x9F, 0x9A, 0x80]
    const emoji = "🚀";
    const bytes = enc.encode(emoji);

    const { output } = await pipeThrough([bytes.slice(0, 2), bytes.slice(2)]);
    expect(output).toBe(emoji);
  });

  it("should detect and strip sentinel split across chunks", async () => {
    const part1 = "some data " + UPSTREAM_ERROR_SENTINEL.slice(0, 5);
    const part2 = UPSTREAM_ERROR_SENTINEL.slice(5) + " error message\nrest of chunk";

    const { output, getState } = await pipeThrough([enc.encode(part1), enc.encode(part2)]);

    const state = getState();
    expect(state.upstreamErrorMsg).toBe("error message");
    expect(output).not.toContain(UPSTREAM_ERROR_SENTINEL);
    expect(output).toContain("some data ");
    expect(output).toContain("rest of chunk");
  });

  it("should parse usage even if sentinel is in the same chunk", async () => {
    const usageEvent = `data: ${JSON.stringify({ usage: { prompt_tokens: 100 } })}\n\n`;
    const chunk = usageEvent + UPSTREAM_ERROR_SENTINEL + " oops\n";

    const { output, getState } = await pipeThrough([enc.encode(chunk)]);

    const state = getState();
    expect(state.finalUsage?.prompt_tokens).toBe(100);
    expect(state.upstreamErrorMsg).toBe("oops");
  });
});
