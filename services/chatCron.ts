import { runSingleModel } from "../handlers/chat/singleModelPipeline.ts";
import { RequestContext } from "../lib/requestContext.ts";
import * as log from "../lib/logger.ts";
import { withLock } from "../lib/redis.ts";

const MODEL = "troll/claude-sonnet-4-6";

const CRON_BODY: Record<string, unknown> = {
  model: MODEL,
  messages: [{ role: "user", content: "ey say nothing" }],
  stream: false,
  max_tokens: 1024,
};

const CRON_SCHEDULE = "30 7,11,15 * * 1-5";

let nextTimer: ReturnType<typeof setTimeout> | null = null;
let isStarted = false;

export function startChatCron(): void {
  if (isStarted) return;
  isStarted = true;

  log.info("CRON", `Chat cron started — schedule: ${CRON_SCHEDULE} | model: ${MODEL}`);
  scheduleNext();
}

export function stopChatCron(): void {
  isStarted = false;
  if (nextTimer) {
    clearTimeout(nextTimer);
    nextTimer = null;
  }
  log.info("CRON", "Chat cron stopped");
}

function scheduleNext(): void {
  if (!isStarted) return;

  const now = Date.now();
  const next = Bun.cron.parse(CRON_SCHEDULE, now);

  if (!next) {
    log.error("CRON", "Could not parse cron schedule — stopping chat cron");
    isStarted = false;
    return;
  }

  const delay = next.getTime() - now;
  log.info("CRON", `Next chat cron scheduled at ${next.toISOString()} (in ${Math.round(delay / 1000)}s)`);

  nextTimer = setTimeout(async () => {
    await runChatCronJob();
    scheduleNext();
  }, delay);
}

async function runChatCronJob(): Promise<void> {
  const result = await withLock("chat-cron:troll-claude-sonnet-4-6", 60, _doChatCronJob);
  if (!result.executed) {
    log.debug("CRON", "Chat cron skipped — another instance holds the lock");
  }
}

// Exported for testing only
export async function _doChatCronJob(): Promise<void> {
  const ctx = RequestContext.create();

  try {
    log.info(ctx, "CRON", `Running chat cron — ${MODEL}`);

    const res = await runSingleModel({
      body: CRON_BODY,
      modelStr: MODEL,
      clientRawRequest: null,
      request: null,
      apiKey: null,
      apiKeyId: null,
      ctx,
      skipComboCheck: true,
    });

    const bodyText = await res.text();
    log.info(ctx, "CRON", `Chat cron complete — ${res.status} (${bodyText.length} bytes)`);
  } catch (err) {
    log.error(ctx, "CRON", `Chat cron failed: ${(err as Error).message}`);
  } finally {
    RequestContext.delete(ctx.id);
  }
}
