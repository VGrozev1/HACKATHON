export type TelegramButton = { text: string; callback_data: string };

function apiUrl(method: string): string {
  // Built lazily, not at module load — so importing this file never
  // requires TELEGRAM_BOT_TOKEN to already be set in the environment.
  return `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;
}

// Calls any Telegram Bot API method. Telegram always responds with
// { ok: true, result: ... } on success or { ok: false, description: ... }
// on failure — it doesn't use HTTP status codes to signal API-level errors,
// so we have to check `ok` ourselves and throw.
export async function callTelegramApi<T = unknown>(
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch(apiUrl(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await response.json();

  if (!data.ok) {
    throw new Error(
      `Telegram API error calling ${method}: ${data.description ?? JSON.stringify(data)}`,
    );
  }
  return data.result as T;
}

export async function sendTelegram(
  text: string,
  buttons?: TelegramButton[],
  chatId: string = process.env.TELEGRAM_STOCKER_CHAT_ID!,
): Promise<void> {
  // The dashboard's run night sets this: the app then sends one route +
  // checklist message and one suggestions message after the run instead of
  // one message per tool call.
  if (process.env.AGENT_TELEGRAM === "off") return;
  await callTelegramApi("sendMessage", {
    chat_id: chatId,
    text,
    // Each button becomes its own row — we only ever send one button per
    // message in this app, so there's no need for multi-column layouts.
    ...(buttons
      ? { reply_markup: { inline_keyboard: buttons.map((button) => [button]) } }
      : {}),
  });
}
