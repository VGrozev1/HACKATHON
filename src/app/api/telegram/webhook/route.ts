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
import { tickMachineInText } from "@/lib/data/night-notify";
import { telegram, type InlineKeyboard } from "@/lib/integrations/telegram";

const STOCKER_CHAT_ID = process.env.TELEGRAM_STOCKER_CHAT_ID;
const APPROVER_CHAT_ID = process.env.TELEGRAM_APPROVER_CHAT_ID;

type TelegramUpdate = {
  update_id: number;
  callback_query?: {
    id: string;
    data?: string;
    message?: { message_id?: number; text?: string; chat?: { id: number | string }; reply_markup?: { inline_keyboard?: InlineKeyboard } };
  };
};

async function answerCallback(callbackQueryId: string, text?: string): Promise<void> {
  await telegram("answerCallbackQuery", { callback_query_id: callbackQueryId, text }).catch((err) =>
    console.error("Telegram answerCallbackQuery failed:", err),
  );
}

/**
 * After Done: tick the machine's items (✅) in the message and turn its Done
 * button into a "Loaded" label, so the stocker sees what's finished.
 */
async function markDoneInMessage(cq: NonNullable<TelegramUpdate["callback_query"]>, machineId: string) {
  const msg = cq.message;
  const keyboard = msg?.reply_markup?.inline_keyboard ?? [];
  const button = keyboard.flat().find((x) => x.callback_data === `done:${machineId}`);
  const m = button?.text.match(/^Done: (\d+)\. (.+)$/);
  if (!msg?.text || !m) return;
  await telegram("editMessageText", {
    chat_id: msg.chat?.id,
    message_id: msg.message_id,
    text: tickMachineInText(msg.text, m[1], m[2]),
    reply_markup: {
      inline_keyboard: keyboard.map((row) =>
        row.map((x) => (x.callback_data === `done:${machineId}` ? { text: `✅ Loaded: ${m[1]}. ${m[2]}`, callback_data: "noop" } : x)),
      ),
    },
  }).catch((err) => console.error("Telegram editMessageText failed:", err));
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
    if (action === "noop") {
      // An already finished machine: nothing to do.
      await answerCallback(cq.id);
    } else if (action === "done" && chatId === STOCKER_CHAT_ID) {
      // id here is a machine id, not a visit id.
      const visit = await completeNextVisit(id);
      if (visit) await markDoneInMessage(cq, id);
      await answerCallback(cq.id, visit ? `${id} marked done: stock updated.` : `No planned visit for ${id}.`);
    } else if (action === "approve" && chatId === APPROVER_CHAT_ID) {
      // Approving, emailing the supplier, and setting status SENT all
      // happen inside approveOrder.
      const order = await approveOrder(id, "telegram");
      await answerCallback(cq.id, order ? "Approved." : `Order ${id} not found.`);
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
