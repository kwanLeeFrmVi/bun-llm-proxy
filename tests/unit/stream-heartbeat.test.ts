import { describe, it, expect, mock, beforeEach } from "bun:test";
import { createHeartbeatTransform } from "../../ai-bridge/utils/streamHeartbeat.ts";

describe("streamHeartbeat", () => {
  const PING_BYTES = new TextEncoder().encode(": ping\n\n");

  beforeEach(() => {
    mock.restore();
  });

  it("should emit pings periodically when no data flows after initial chunk", async () => {
    const intervalMs = 50;
    const { transform, stop } = createHeartbeatTransform(intervalMs);
    const writer = transform.writable.getWriter();
    const reader = transform.readable.getReader();

    // Start consuming
    const chunks: Uint8Array[] = [];
    const readPromise = (async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
    })();

    // Send an initial chunk to arm the heartbeat timer (timer only starts on transform())
    const data = new TextEncoder().encode("init");
    await writer.write(data);

    // Wait for ≥3 pings (data + ≥3 pings)
    await Bun.sleep(intervalMs * 3.5);

    stop();
    await writer.close();
    await readPromise;

    // First chunk is the initial data, rest should be pings
    expect(chunks[0]).toEqual(data);
    const pings = chunks.slice(1);
    expect(pings.length).toBeGreaterThanOrEqual(3);
    for (const ping of pings) {
      expect(ping).toEqual(PING_BYTES);
    }
  });

  it("should reset timer when a data chunk passes through", async () => {
    const intervalMs = 100;
    const { transform, stop } = createHeartbeatTransform(intervalMs);
    const writer = transform.writable.getWriter();
    const reader = transform.readable.getReader();

    const chunks: Uint8Array[] = [];
    const readPromise = (async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
    })();

    const data = new TextEncoder().encode("hello");

    // Wait half-interval, then send data
    await Bun.sleep(intervalMs / 2);
    await writer.write(data);

    // Wait another half-interval — no ping should have fired yet
    await Bun.sleep(intervalMs / 2);
    
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toEqual(data);

    // Wait for the next ping
    await Bun.sleep(intervalMs);
    
    stop();
    await writer.close();
    await readPromise;

    expect(chunks.length).toBe(2);
    expect(chunks[1]).toEqual(PING_BYTES);
  });

  it("should stop emitting pings after stop() is called", async () => {
    const intervalMs = 50;
    const { transform, stop } = createHeartbeatTransform(intervalMs);
    const writer = transform.writable.getWriter();
    const reader = transform.readable.getReader();

    const chunks: Uint8Array[] = [];
    (async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
    })();

    // Send initial data to arm the timer
    await writer.write(new TextEncoder().encode("go"));

    // Wait for 1st ping (initial data + 1 ping)
    await Bun.sleep(intervalMs * 1.5);
    expect(chunks.length).toBeGreaterThanOrEqual(2);

    const countBefore = chunks.length;
    stop();

    // Wait for more intervals — no more pings
    await Bun.sleep(intervalMs * 3);
    expect(chunks.length).toBe(countBefore);

    await writer.close();
  });
});
