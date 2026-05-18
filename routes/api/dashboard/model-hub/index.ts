import { checkAdminAuth } from "lib/authMiddleware.ts";
import { CORS_HEADERS } from "lib/cors.ts";
import { register } from "lib/routeRegistry";

const MODEL_HUB_URL = "https://claudible.io/api/model-hub";

export async function GET(req: Request): Promise<Response> {
  const auth = await checkAdminAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const upstream = await fetch(MODEL_HUB_URL, {
      headers: {
        Accept: "*/*",
        Referer: "https://claudible.io/model-hub",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
      },
    });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => upstream.statusText);
      return Response.json(
        { error: `Claudible model-hub error ${upstream.status}: ${text}` },
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

register("/api/dashboard/model-hub", { GET, OPTIONS });
