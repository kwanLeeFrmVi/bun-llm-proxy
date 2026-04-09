// Bun runtime entry point for v1 API endpoints
import { initTranslators } from "./ai-bridge/translator/index.ts";
import { openDb } from "./db/index.ts";
import { initConsoleLogCapture } from "./lib/consoleLogBuffer.ts";
import { corsResponse } from "./lib/cors.ts";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

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

const { buildRoutes } = await import("./lib/routeRegistry.ts");
const routes = buildRoutes();

const server = Bun.serve({
  port: PORT,
  reusePort: isLinux, // SO_REUSEPORT: Linux only, enables multi-process clustering
  routes,

  async fetch(req) {
    if (req.method === "OPTIONS") return corsResponse();
    const url = new URL(req.url);

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
        headers: { "Content-Type": "text/html" }
      });
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`[BUN] Listening on port ${server.port}`);
