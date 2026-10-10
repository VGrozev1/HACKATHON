// POST /api/telegram/webhook — Telegram calls this when the stocker taps a button
// ("done" on a load list, "approve" on a big order). Viktor builds it in B6 with grammY;
// it should call the same logic as POST /api/visits/:id/done and /api/orders/:id/approve.
// Register once: https://api.telegram.org/bot<TOKEN>/setWebhook?url=<APP_URL>/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>
import type { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  if (req.headers.get("x-telegram-bot-api-secret-token") !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  // TODO(B6): hand the update to the grammY bot.
  return Response.json({ ok: true });
}
