// POST /api/telegram/webhook — Telegram delivers button taps here (registered
// with setWebhook and our secret token). Same rules as agent/bot.ts, which this
// replaces once the webhook is set (Telegram sends updates to a webhook OR to
// polling, never both):
//
//   done:<machineId>  (stocker chat)  → complete that machine's next visit
//   approve:<orderId> (approver chat) → approve the order; the supplier is emailed
//   sug_ok:<id> / sug_no:<id> (approver chat) → accept / reject a suggestion
//
// Security: the secret header must match, taps only count from our two chats,
// repeated taps are harmless (the database state decides), and every tap is
// answered so the button stops spinning. Always 200, so Telegram doesn't retry.
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { approveOrder } from "@/lib/data/fleet";
import { decideSuggestion } from "@/lib/data/suggestions";
import { completeNextVisit } from "@/lib/data/visits";

export const maxDuration = 30;

type CallbackQuery = {
  id: string;
  data?: string;
  from?: { username?: string; first_name?: string };
  message?: { message_id: number; text?: string; chat?: { id: number | string } };
};

function secretMatches(header: string | null): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
  if (!header || !expected || header.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

async function telegram(method: string, params: Record<string, unknown>) {
  try {
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  } catch (err) {
    console.error(`[telegram] ${method} failed:`, err instanceof Error ? err.message : err);
  }
}

/** Run one tap; returns the short answer shown to the person, and a line to add to the message when it changed something. */
async function handle(action: string, id: string, chatId: string, who: string): Promise<{ answer: string; stamp?: string }> {
  const stocker = chatId === process.env.TELEGRAM_STOCKER_CHAT_ID;
  const approver = chatId === process.env.TELEGRAM_APPROVER_CHAT_ID;

  if (action === "done" && stocker) {
    const visit = await completeNextVisit(id);
    return visit ? { answer: `${id} marked done.`, stamp: "✅ Done: stock updated" } : { answer: `No open visit for ${id}: already done?` };
  }
  if (action === "approve" && approver) {
    const order = await approveOrder(id, `telegram:${who}`);
    if (!order) return { answer: `Order ${id} not found.` };
    if (order.status === "SENT") return { answer: "Approved and emailed.", stamp: `✅ Approved by ${who}, emailed to the supplier` };
    if (order.status === "APPROVED") return { answer: "Approved (email not sent).", stamp: `✅ Approved by ${who}` };
    return { answer: `Already ${order.status.toLowerCase().replace("_", " ")}.` };
  }
  if ((action === "sug_ok" || action === "sug_no") && approver) {
    const result = await decideSuggestion(id, action === "sug_ok" ? "accepted" : "rejected");
    if ("notFound" in result) return { answer: `Suggestion ${id} not found.` };
    if ("conflict" in result) return { answer: result.conflict! };
    return action === "sug_ok" ? { answer: "Marked accepted.", stamp: "✅ Accepted" } : { answer: "Marked rejected.", stamp: "❌ Rejected" };
  }
  return { answer: "Not allowed." };
}

export async function POST(req: NextRequest) {
  if (!secretMatches(req.headers.get("x-telegram-bot-api-secret-token"))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let update: { callback_query?: CallbackQuery };
  try {
    update = await req.json();
  } catch {
    return Response.json({ ok: true }); // not JSON: nothing to do, and no retries
  }
  const cq = update.callback_query;
  if (!cq?.id) return Response.json({ ok: true }); // plain messages etc. are ignored

  const chatId = String(cq.message?.chat?.id ?? "");
  const trusted = chatId && (chatId === process.env.TELEGRAM_STOCKER_CHAT_ID || chatId === process.env.TELEGRAM_APPROVER_CHAT_ID);
  if (!trusted) {
    await telegram("answerCallbackQuery", { callback_query_id: cq.id });
    return Response.json({ ok: true });
  }

  const [action = "", id = ""] = (cq.data ?? "").split(":");
  const who = cq.from?.username ?? cq.from?.first_name ?? "telegram";
  let result: { answer: string; stamp?: string };
  try {
    result = id ? await handle(action, id, chatId, who) : { answer: "Not allowed." };
  } catch (err) {
    console.error("[telegram] tap failed:", err);
    result = { answer: "Something went wrong; try again." };
  }

  await telegram("answerCallbackQuery", { callback_query_id: cq.id, text: result.answer });
  if (result.stamp && cq.message) {
    // Show the outcome on the message itself and remove its button.
    await telegram("editMessageText", {
      chat_id: chatId,
      message_id: cq.message.message_id,
      text: `${cq.message.text ?? ""}\n\n${result.stamp}`.trim(),
    });
  }
  return Response.json({ ok: true });
}
