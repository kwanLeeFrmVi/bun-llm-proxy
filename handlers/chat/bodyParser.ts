import { errorResponse } from "../../ai-bridge/utils/error.ts";
import { HTTP_STATUS } from "../../ai-bridge/config/runtimeConfig.ts";
import { formatAwareErrorResponse } from "./errorShaping.ts";
import * as log from "../../lib/logger.ts";
import type { RequestContext } from "../../lib/requestContext.ts";

export type ClientRawRequest = {
  endpoint: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
};

export type ParseResult =
  | {
      ok: true;
      body: Record<string, unknown>;
      modelStr: string;
      msgCount: number;
      toolCount: number;
      effort: string | null;
      clientRawRequest: ClientRawRequest;
    }
  | { ok: false; response: Response };

export async function parseAndValidateRequest(
  request: Request,
  ctx: RequestContext,
  clientRawRequest?: ClientRawRequest | null
): Promise<ParseResult> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    log.warn(ctx, "CHAT", "Invalid JSON body");
    return { ok: false, response: errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid JSON body") as Response };
  }

  let resolvedClientRawRequest = clientRawRequest ?? null;
  if (!resolvedClientRawRequest) {
    const url = new URL(request.url);
    resolvedClientRawRequest = {
      endpoint: url.pathname,
      body,
      headers: Object.fromEntries(request.headers.entries()),
    };
  }

  const modelStr = body.model as string;

  const msgCount =
    (body.messages as unknown[] | undefined)?.length ??
    (body.input as unknown[] | undefined)?.length ??
    0;
  const toolCount = (body.tools as unknown[] | undefined)?.length ?? 0;
  const eff1 = typeof body.reasoning_effort === "string" ? body.reasoning_effort : undefined;
  const reasoningObj = body.reasoning as Record<string, unknown> | undefined;
  const eff2 = typeof reasoningObj?.effort === "string" ? reasoningObj.effort : undefined;
  const effort = (eff1 ?? eff2) as string | null;

  if (!modelStr) {
    return {
      ok: false,
      response: formatAwareErrorResponse(body, request, HTTP_STATUS.BAD_REQUEST, "Missing model"),
    };
  }

  return {
    ok: true,
    body,
    modelStr,
    msgCount,
    toolCount,
    effort,
    clientRawRequest: resolvedClientRawRequest,
  };
}
