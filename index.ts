// Bun runtime entry point for v1 API endpoints
import { initTranslators } from "./ai-bridge/translator/index.ts";
import { openDb } from "./db/index.ts";
import {
  initConsoleLogCapture,
  getConsoleLogs,
  getConsoleEmitter,
  clearConsoleLogs,
} from "./lib/consoleLogBuffer.ts";
import { corsResponse } from "./lib/cors.ts";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { getSessionByToken } from "./db/index.ts";
import type { ConsoleLogEntry } from "./lib/consoleLogBuffer.ts";
import type { ServerWebSocket } from "bun";

// Initialize DB (creates tables, opens WAL connection)
openDb();

// Start background OAuth token refresh (every 2min, refreshes tokens expiring within 15min)
import { startBackgroundTokenRefresh } from "./services/tokenRefresh.ts";
startBackgroundTokenRefresh();

// Capture server-side console logs for the dashboard log panel
initConsoleLogCapture();

// Initialize translators once at boot
await initTranslators();
console.log("[BUN] Translators initialized");

// Recursively import all routes/**/*.ts to trigger their register() calls
async function loadAllRoutes(dir: string): Promise<void> {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      await loadAllRoutes(full);
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      await import(`file://${full}`);
    }
  }
}

const PORT = parseInt(process.env.PORT ?? "20129");
const isLinux = process.platform === "linux";

// Load all route files so they self-register, then build the routes config
await loadAllRoutes(join(process.cwd(), "routes"));

// ─── WebSocket: /ws/console-logs ──────────────────────────────────────────────

type WsData = {
  onLine: (entry: ConsoleLogEntry) => void;
  onClear: () => void;
  heartbeat: ReturnType<typeof setInterval>;
};

const clients = new Set<ServerWebSocket<Request> & WsData>();

function handleWsConsoleLogOpen(ws: ServerWebSocket<Request>) {
  const req = ws.data;
  const token = req?.url ? new URL(req.url).searchParams.get("token") : null;

  if (!token) {
    ws.close(1008, "Unauthorized");
    return;
  }

  getSessionByToken(token)
    .then((session) => {
      if (!session) {
        ws.close(1008, "Unauthorized");
        return;
      }

      const emitter = getConsoleEmitter();
      const heartbeat = setInterval(() => {
        try {
          ws.send(": ping");
        } catch {
          clearInterval(heartbeat);
        }
      }, 15_000);

      const onLine = (entry: ConsoleLogEntry) => {
        try {
          ws.send(JSON.stringify(entry));
        } catch {
          /* closed */
        }
      };

      const onClear = () => {
        try {
          ws.send(JSON.stringify({ type: "clear" }));
        } catch {
          /* closed */
        }
      };

      const d = ws as ServerWebSocket<Request> & WsData;
      d.onLine = onLine;
      d.onClear = onClear;
      d.heartbeat = heartbeat;
      clients.add(d);

      // Send current buffer
      for (const entry of getConsoleLogs()) {
        try {
          ws.send(JSON.stringify(entry));
        } catch {
          break;
        }
      }

      emitter.on("line", onLine);
      emitter.on("clear", onClear);
    })
    .catch(() => ws.close(1011, "Internal error"));
}

function handleWsConsoleLogClose(ws: ServerWebSocket<Request>) {
  const d = ws as ServerWebSocket<Request> & WsData;
  clearInterval(d.heartbeat);
  clients.delete(d);
  try {
    getConsoleEmitter().off("line", d.onLine);
    getConsoleEmitter().off("clear", d.onClear);
  } catch {
    /* already cleared */
  }
}

function handleWsConsoleLogMessage(ws: ServerWebSocket<Request>, msg: string) {
  if (msg === "clear") {
    clearConsoleLogs();
  }
}

// ─── Load routes ──────────────────────────────────────────────────────────────

const { buildRoutes } = await import("./lib/routeRegistry.ts");
const routes = buildRoutes();

// We need a reference to server for WebSocket upgrade, so we use a mutable holder
let serverRef: ReturnType<typeof Bun.serve>;

// Register the WebSocket upgrade route directly in the routes config
// This ensures it's matched by Bun's router before the SPA catch-all in fetch
routes["/ws/console-logs"] = {
  GET: (req: Request) => {
    console.log("[WS] /ws/console-logs route hit! headers:", req.headers.get("sec-websocket-key"));
    const upgraded = serverRef.upgrade(req, { data: req });
    console.log("[WS] upgrade result:", upgraded);
    if (upgraded) return undefined as unknown as Response;
    return new Response("WebSocket upgrade failed", { status: 500 });
  },
};

const server = Bun.serve({
  port: PORT,
  reusePort: isLinux, // SO_REUSEPORT: Linux only, enables multi-process clustering
  routes,
  websocket: {
    open(ws: ServerWebSocket<Request>) {
      const req = ws.data;
      if (req) handleWsConsoleLogOpen(ws);
    },
    message(ws: ServerWebSocket<Request>, msg) {
      handleWsConsoleLogMessage(ws, msg.toString());
    },
    close(ws: ServerWebSocket<Request>) {
      handleWsConsoleLogClose(ws);
    },
    // Pass the original HTTP request as WebSocket data for auth
    data: {} as Request,
  },

  fetch(req, server) {
    if (req.method === "OPTIONS") return corsResponse();
    const url = new URL(req.url);

    // Fallback WS upgrade for any /ws/* paths not matched by routes
    if (url.pathname.startsWith("/ws/")) {
      console.log("[WS] fetch fallback hit for:", url.pathname);
      const upgraded = server.upgrade(req, { data: req });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    return handleHttpRequest(url, req);
  },
});

serverRef = server;

async function handleHttpRequest(url: URL, req: Request): Promise<Response> {
  // Serve dashboard built assets (CSS, JS, images)
  if (url.pathname.startsWith("/assets/")) {
    const file = Bun.file(join(process.cwd(), "dashboard/dist", url.pathname));
    if (await file.exists()) return new Response(file);
  }

  // Serve dashboard SPA for all non-API routes
  if (!url.pathname.startsWith("/api") && !url.pathname.startsWith("/v1")) {
    // Check for static files in dist root (logo.svg, etc.)
    const staticFile = Bun.file(join(process.cwd(), "dashboard/dist", url.pathname));
    if (await staticFile.exists()) return new Response(staticFile);

    // Fall back to index.html for SPA routing
    const file = Bun.file(join(process.cwd(), "dashboard/dist/index.html"));
    return new Response(file, {
      headers: { "Content-Type": "text/html" },
    });
  }

  return new Response("Not found", { status: 404 });
}

console.log(`[BUN] Listening on port ${server.port}`);
