import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { callTelegramApi } from "./telegram.ts";
import { sendSupplierEmail } from "./email.ts";
import type { PurchaseOrder } from "./tools.ts";
import type { RunResult } from "./agent.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const runsDir = path.join(here, "runs");

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

async function findNewestRunFile(): Promise<string | null> {
  let entries: string[];
  try {
    entries = await readdir(runsDir);
  } catch {
    return null; // no runs/ directory yet — nothing has run tonight
  }

  const jsonFiles = entries.filter((f) => f.endsWith(".json"));
  if (jsonFiles.length === 0) return null;

  let newest: { file: string; mtimeMs: number } | null = null;
  for (const file of jsonFiles) {
    const fullPath = path.join(runsDir, file);
    const stats = await stat(fullPath);
    if (!newest || stats.mtimeMs > newest.mtimeMs) {
      newest = { file: fullPath, mtimeMs: stats.mtimeMs };
    }
  }
  return newest?.file ?? null;
}

async function findOrderInNewestRun(orderId: string): Promise<PurchaseOrder | null> {
  const newestFile = await findNewestRunFile();
  if (!newestFile) return null;

  const content = await readFile(newestFile, "utf-8");
  const run = JSON.parse(content) as RunResult;
  return run.orders.find((order) => order.id === orderId) ?? null;
}

// Suggestions are never applied — this only updates the status field on
// disk, in the same run file Todor's API will eventually read from.
async function setSuggestionStatus(
  suggestionId: string,
  status: "accepted" | "rejected",
): Promise<boolean> {
  const newestFile = await findNewestRunFile();
  if (!newestFile) return false;

  const content = await readFile(newestFile, "utf-8");
  const run = JSON.parse(content) as RunResult;
  const suggestion = run.suggestions?.find((s) => s.id === suggestionId);
  if (!suggestion) return false;

  suggestion.status = status;
  await writeFile(newestFile, JSON.stringify(run, null, 2));
  return true;
}

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
      // Step 11 will call Todor's API here instead of just logging.
      console.log(`Visit to ${id} marked done.`);
      processedActions.add(data);
      await callTelegramApi("answerCallbackQuery", {
        callback_query_id: callbackQuery.id,
        text: `${id} marked done.`,
      });
    } else if (action === "approve" && chatId === APPROVER_CHAT_ID) {
      const order = await findOrderInNewestRun(id);
      if (!order) {
        throw new Error(`Order ${id} not found in the latest run.`);
      }
      await sendSupplierEmail(order);
      processedActions.add(data);
      await callTelegramApi("answerCallbackQuery", {
        callback_query_id: callbackQuery.id,
        text: "approved and emailed",
      });
    } else if (action === "sug_ok" && chatId === APPROVER_CHAT_ID) {
      // Accepting a suggestion only records the decision — it never
      // touches prices, stock, or orders by itself.
      const found = await setSuggestionStatus(id, "accepted");
      if (!found) throw new Error(`Suggestion ${id} not found in the latest run.`);
      processedActions.add(data);
      await callTelegramApi("answerCallbackQuery", {
        callback_query_id: callbackQuery.id,
        text: "Marked accepted.",
      });
    } else if (action === "sug_no" && chatId === APPROVER_CHAT_ID) {
      const found = await setSuggestionStatus(id, "rejected");
      if (!found) throw new Error(`Suggestion ${id} not found in the latest run.`);
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
