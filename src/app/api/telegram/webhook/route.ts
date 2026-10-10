// POST /api/telegram/webhook — would receive Telegram button taps (Done on a
// load list, Approve on a big order, Accept/Reject on a suggestion) if this
// bot were registered for webhook delivery.
//
// It isn't: agent/bot.ts already handles every one of those taps today via
// long-polling (getUpdates), left running continuously in its own terminal.
// Telegram delivers updates ONE way per bot, polling or webhook, never both —
// calling the setWebhook URL that used to be documented here would silently
// break bot.ts. Leave this endpoint unregistered and bot.ts running unless a
// deliberate decision is made to migrate off polling, in which case this
// would take over bot.ts's handleCallback logic (see agent/bot.ts) instead of
// just echoing { ok: true }.
import type { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  if (req.headers.get("x-telegram-bot-api-secret-token") !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return Response.json({ ok: true });
}
