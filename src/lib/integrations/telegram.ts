// Minimal Telegram Bot API client for the app (server side): sending the
// night's messages and updating buttons when the stocker ticks items off.

export type InlineButton = { text: string; callback_data: string };
export type InlineKeyboard = InlineButton[][];

export async function telegram<T = unknown>(method: string, params: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!data.ok) throw new Error(`Telegram ${method} failed: ${data.description ?? res.status}`);
  return data.result as T;
}

/** Telegram allows at most 100 buttons on one message. */
export const MAX_BUTTONS_PER_MESSAGE = 100;
