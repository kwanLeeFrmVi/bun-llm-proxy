import { handleChat } from "handlers/chat.ts";
import { CORS_HEADERS } from "lib/cors.ts";
import { register } from "lib/routeRegistry";
import * as log from "lib/logger.ts";

export async function POST(req: Request): Promise<Response> {
  const res = await handleChat(req);
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  const proxyErr = res.headers.get("X-Proxy-Error");
  log.info(
    null,
    "SEND",
    `POST /v1/responses → ${res.status}${proxyErr ? ` (proxy error: ${proxyErr})` : ""}`
  );
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

register("/v1/responses", { POST, OPTIONS });
