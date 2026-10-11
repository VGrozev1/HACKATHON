// Long-polling: an alternative to the webhook at
// src/app/api/telegram/webhook/route.ts, for local dev without a public
// HTTPS URL. Only one of the two should be active — see agent/README.md's
// "Telegram: webhook vs. polling" section.
import { pathToFileURL } from "node:url";
import { callTelegramApi } from "./telegram.ts";
import { apiPost } from "./api.ts";

const STOCKER_CHAT_ID = process.env.TELEGRAM_STOCKER_CHAT_ID!;
const APPROVER_CHAT_ID = process.env.TELEGRAM_APPROVER_CHAT_ID!;

// callback_data values we've already acted on, e.g. "done:GYM-01" or
// "approve:PO-0002" — in memory only, so it resets if the bot restarts.
const processedActions = new Set<string>();

type TelegramUpdate = {
  update_id: number;
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat?: { id: number | string } };
  };
};

async function handleCallback(
  callbackQuery: NonNullable<TelegramUpdate["callback_query"]>,
): Promise<void> {
  const chatId = String(callbackQuery.message?.chat?.id ?? "");
  const data = callbackQuery.data ?? "";

  // SECURITY: a Telegram bot's callback_data is just a string the message
  // itself carries — anyone who can see the button and send the tap back
  // to our bot could, in principle, replay or guess it. The only thing
  // telling us "this came from somewhere we trust" is which chat it
  // arrived in. So before touching anything, reject any chat that isn't
  // one of our two known chats.
  if (chatId !== STOCKER_CHAT_ID && chatId !== APPROVER_CHAT_ID) {
    console.log(`Ignoring button tap from untrusted chat ${chatId}`);
    await callTelegramApi("answerCallbackQuery", { callback_query_id: callbackQuery.id });
    return;
  }

  if (processedActions.has(data)) {
    await callTelegramApi("answerCallbackQuery", {
      callback_query_id: callbackQuery.id,
      text: "Already handled.",
    });
    return;
  }

  const [action, id] = data.split(":");

  try {
    if (action === "done" && chatId === STOCKER_CHAT_ID) {
      // id here is a machine id, not a visit id — see POST /api/machines/:id/visit-done.
      await apiPost(`/api/machines/${encodeURIComponent(id)}/visit-done`);
      processedActions.add(data);
      await callTelegramApi("answerCallbackQuery", {
        callback_query_id: callbackQuery.id,
        text: `${id} marked done.`,
      });
    } else if (action === "approve" && chatId === APPROVER_CHAT_ID) {
      // Approving, emailing the supplier, and setting status SENT all
      // happen server-side now.
      await apiPost(`/api/orders/${encodeURIComponent(id)}/approve`);
      processedActions.add(data);
      await callTelegramApi("answerCallbackQuery", {
        callback_query_id: callbackQuery.id,
        text: "approved and emailed",
      });
    } else if (action === "sug_ok" && chatId === APPROVER_CHAT_ID) {
      // Accepting a suggestion only records the decision — it never
      // touches prices, stock, or orders by itself.
      await apiPost(`/api/suggestions/${encodeURIComponent(id)}/accept`);
      processedActions.add(data);
      await callTelegramApi("answerCallbackQuery", {
        callback_query_id: callbackQuery.id,
        text: "Marked accepted.",
      });
    } else if (action === "sug_no" && chatId === APPROVER_CHAT_ID) {
      await apiPost(`/api/suggestions/${encodeURIComponent(id)}/reject`);
      processedActions.add(data);
      await callTelegramApi("answerCallbackQuery", {
        callback_query_id: callbackQuery.id,
        text: "Marked rejected.",
      });
    } else {
      // Either an action we don't recognize, or the right action tapped
      // from the wrong chat (e.g. "approve:..." arriving from the stocker
      // chat) — both are treated the same: don't act on it.
      await callTelegramApi("answerCallbackQuery", {
        callback_query_id: callbackQuery.id,
        text: "Not allowed.",
      });
    }
  } catch (err) {
    console.error("Failed to handle button tap:", err);
    await callTelegramApi("answerCallbackQuery", {
      callback_query_id: callbackQuery.id,
      text: "Error — see bot logs.",
    });
  }
}

export async function pollTelegram(): Promise<never> {
  console.log("Telegram bot listening for button taps... (Ctrl+C to stop)");
  let offset = 0;

  while (true) {
    let updates: TelegramUpdate[];
    try {
      updates = await callTelegramApi<TelegramUpdate[]>("getUpdates", { offset, timeout: 30 });
    } catch (err) {
      console.error(
        "getUpdates failed, retrying in 5s:",
        err instanceof Error ? err.message : err,
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
      continue;
    }

    for (const update of updates) {
      offset = update.update_id + 1;
      if (update.callback_query) {
        await handleCallback(update.callback_query);
      }
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  pollTelegram();
}
