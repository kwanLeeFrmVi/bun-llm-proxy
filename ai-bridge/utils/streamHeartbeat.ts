// Heartbeat TransformStream for the v2 streaming pipeline.
// Forwards every chunk unchanged; when no data arrives within `intervalMs`,
// injects an SSE comment ping (`: ping\n\n`) to keep the downstream alive.
//
// Replaces the Promise.race heartbeat pattern in the original wrapStreamingResponse.

const PING_BYTES = new TextEncoder().encode(": ping\n\n");

export interface HeartbeatTransformHandle {
  transform: TransformStream<Uint8Array, Uint8Array>;
  /** Call to stop heartbeat timers (e.g. on client disconnect / error). */
  stop(): void;
}

export function createHeartbeatTransform(
  intervalMs: number = 15_000
): HeartbeatTransformHandle {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let controllerRef: TransformStreamDefaultController<Uint8Array> | null = null;

  const cleanup = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    controllerRef = null;
  };

  const resetTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (controllerRef) {
      const tick = () => {
        try {
          // Enqueue a fresh copy to avoid any zero-copy edge cases where
          // a single shared Uint8Array could be transferred/neutered.
          controllerRef?.enqueue(new Uint8Array(PING_BYTES));
        } catch {
          cleanup();
          return;
        }
        if (controllerRef) {
          timer = setTimeout(tick, intervalMs);
        }
      };
      timer = setTimeout(tick, intervalMs);
    }
  };

  return {
    transform: new TransformStream<Uint8Array, Uint8Array>({
      start(controller: TransformStreamDefaultController<Uint8Array>): void {
        // Prime the heartbeat from the outset. Without this, a slow upstream
        // TTFB (>intervalMs) leaves the downstream with zero activity, which
        // proxies/CDNs treat as an idle close.
        controllerRef = controller;
        resetTimer();
      },

      transform(chunk: Uint8Array, controller: TransformStreamDefaultController<Uint8Array>): void {
        controllerRef = controller;
        controller.enqueue(chunk);
        resetTimer();
      },

      flush(): void {
        cleanup();
      },
    }),
    stop: cleanup,
  };
}
