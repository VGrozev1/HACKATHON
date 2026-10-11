// POST /api/telegram/webhook — Telegram calls this on every button tap
// (Done on a load list, Approve on a big order, Accept/Reject on a
// suggestion), once registered (see agent/README.md for how). Runs the
// same logic as POST /api/machines/:id/visit-done, /api/orders/:id/approve,
// and /api/suggestions/:id/accept|reject — directly against the data layer,
// since this route already runs inside the same app (no HTTP hop needed).
//
// Mutually exclusive with agent/bot.ts's long-polling (getUpdates): Telegram
// delivers updates one way per bot, never both. Registering this webhook
// makes bot.ts's getUpdates calls start failing — that's expected, not a
// bug; stop running bot.ts once this is registered. For local dev without
// a public HTTPS URL for Telegram to call, use bot.ts instead (deleteWebhook
// first — see agent/README.md).
import type { NextRequest } from "next/server";
import { approveOrder } from "@/lib/data/fleet";
import { decideSuggestion } from "@/lib/data/suggestions";
import { completeNextVisit } from "@/lib/data/visits";

const STOCKER_CHAT_ID = process.env.TELEGRAM_STOCKER_CHAT_ID;
const APPROVER_CHAT_ID = process.env.TELEGRAM_APPROVER_CHAT_ID;

type TelegramUpdate = {
  update_id: number;
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat?: { id: number | string } };
  };
};

async function answerCallback(callbackQueryId: string, text?: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  }).catch((err) => console.error("Telegram answerCallbackQuery failed:", err));
}

export async function POST(req: NextRequest) {
  // Without a configured secret, a missing header would equal the missing
  // secret (undefined === undefined) and let anyone in: refuse instead.
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const update: TelegramUpdate = await req.json();
  const cq = update.callback_query;
  if (!cq) return Response.json({ ok: true });

  const chatId = String(cq.message?.chat?.id ?? "");
  const [action, id] = (cq.data ?? "").split(":");

  // SECURITY: callback_data is just a string the message itself carries —
  // anyone who can see the button and send the tap back could, in
  // principle, replay or guess it. The only thing telling us "this came
  // from somewhere we trust" is which chat it arrived in.
  if (chatId !== STOCKER_CHAT_ID && chatId !== APPROVER_CHAT_ID) {
    console.log(`Ignoring button tap from untrusted chat ${chatId}`);
    await answerCallback(cq.id);
    return Response.json({ ok: true });
  }

  try {
    if (action === "done" && chatId === STOCKER_CHAT_ID) {
      // id here is a machine id, not a visit id.
      const visit = await completeNextVisit(id);
      await answerCallback(cq.id, visit ? `${id} marked done.` : `No planned visit for ${id}.`);
    } else if (action === "approve" && chatId === APPROVER_CHAT_ID) {
      // Approving, emailing the supplier, and setting status SENT all
      // happen inside approveOrder.
      const order = await approveOrder(id, "telegram");
      await answerCallback(cq.id, order ? "approved and emailed" : `Order ${id} not found.`);
    } else if (action === "sug_ok" && chatId === APPROVER_CHAT_ID) {
      // Accepting/rejecting only changes status — never prices, stock, or orders.
      const result = await decideSuggestion(id, "accepted");
      await answerCallback(cq.id, "suggestion" in result ? "Marked accepted." : "conflict" in result ? result.conflict : `Suggestion ${id} not found.`);
    } else if (action === "sug_no" && chatId === APPROVER_CHAT_ID) {
      const result = await decideSuggestion(id, "rejected");
      await answerCallback(cq.id, "suggestion" in result ? "Marked rejected." : "conflict" in result ? result.conflict : `Suggestion ${id} not found.`);
    } else {
      // Either an action we don't recognize, or the right action tapped
      // from the wrong chat (e.g. "approve:..." from the stocker chat) —
      // both treated the same: don't act on it.
      await answerCallback(cq.id, "Not allowed.");
    }
  } catch (err) {
    console.error("Telegram webhook failed to handle callback:", err);
    await answerCallback(cq.id, "Error — see server logs.");
  }

  return Response.json({ ok: true });
}
