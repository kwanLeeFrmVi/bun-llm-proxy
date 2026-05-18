import { getProviderConnections } from "db/index.ts";
import { checkAdminAuth } from "lib/authMiddleware.ts";
import { CORS_HEADERS } from "lib/cors.ts";
import { register } from "lib/routeRegistry";

const CLAUDIBLE_LOOKUP_URL = "https://claudible.io/dashboard/lookup";

export async function POST(req: Request): Promise<Response> {
  // Require dashboard auth
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  let providerKey: "cldb" | "vcd" = "vcd";
  try {
    const body = (await req.json().catch(() => ({}))) as { provider?: string };
    if (body.provider === "vcd" || body.provider === "cldb") providerKey = body.provider;
    else if (body.provider !== undefined) {
      return Response.json(
        { error: `Invalid provider '${body.provider}'. Expected 'cldb' or 'vcd'.` },
        { status: 400, headers: CORS_HEADERS }
      );
    }
  } catch {
    // empty body — keep default
  }

  const providerSlug = `anthropic-compatible-${providerKey}`;
  const connections = await getProviderConnections({ provider: providerSlug });
  const conn = connections[0];

  if (!conn || !conn.apiKey) {
    return Response.json(
      {
        error: `No Claudible provider connection found. Add a '${providerSlug}' provider with a valid API key.`,
      },
      { status: 404, headers: CORS_HEADERS }
    );
  }

  const apiKey = conn.apiKey as string;

  try {
    const upstream = await fetch(CLAUDIBLE_LOOKUP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "*/*",
        Origin: "https://claudible.io",
        Referer: "https://claudible.io/dashboard",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({ key: apiKey }),
    });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => upstream.statusText);
      return Response.json(
        { error: `Claudible API error ${upstream.status}: ${text}` },
        { status: upstream.status, headers: CORS_HEADERS }
      );
    }

    const data = await upstream.json();
    return Response.json(data, { headers: CORS_HEADERS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `Failed to reach claudible.io: ${msg}` },
      { status: 502, headers: CORS_HEADERS }
    );
  }
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

register("/api/dashboard/lookup", { POST, OPTIONS });
