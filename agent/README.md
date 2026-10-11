# Vending AI — night-shift agent

An AI agent that runs the nightly restocking routine for a small fleet of
vending machines: checks stock and alerts, adjusts forecasts for weather and
holidays, plans a delivery route, places supplier orders, raises suggestions
for the manager, and notifies the stocker — all over Telegram, with the
real guardrails (approved supplier, product/shelf-life, warehouse capacity,
price-change caps, 5-suggestions-a-night) enforced server-side, against the
real catalog, not guessed locally.

## What it does, step by step

Defined in [`prompt.md`](prompt.md) (the system prompt) and executed by
[`agent.ts`](agent.ts)'s `runNight()`:

1. List all machines.
2. Check for alerts (offline, sudden zero sales, cash mismatches, stock-outs,
   expiring food) and explain the likely cause of each.
3. Check stock and a 2-day forecast per machine.
4. Adjust the forecast for weather, holidays, and yesterday's forecast
   misses — with a one-line reason for every number changed.
5. Decide which machines need a visit tomorrow.
6. Plan an efficient delivery route.
7. Build a load list per machine (never over slot capacity).
8. Place purchase orders (one per supplier), retrying a rejected order once.
9. Raise 2–5 suggestions for the manager, only when the data supports them.
10. Notify the stocker with the route and load lists.

It finishes with a plain-language summary covering all of the above.

## Files

| File | Purpose |
|---|---|
| `agent.ts` | `runNight(date, onStep?)` — the agentic loop (25-step cap), saves each run to `runs/` |
| `prompt.md` | The system prompt — the routine above, in full |
| `tools.ts` | Every tool definition + implementation + the `runTool` dispatcher — every tool calls Todor's real Agent API (api.md) |
| `api.ts` | Thin `fetch` helper for Todor's real API (`apiGet`/`apiPost`), throws a clear error on failure |
| `telegram.ts` | Low-level Telegram Bot API helper (`sendTelegram` with optional buttons) |
| `bot.ts` | Long-polls Telegram for button taps (Done / Approve / Accept / Reject), each one a direct call to the real API — run this in its own terminal, continuously |
| `misses.ts` | Reads yesterday's forecast, compares to real actual sales (`/api/machines/:id/sales/products`), surfaces the 3 biggest misses into tonight's run |
| `test-tools-live.ts` | Tests every tool against a tiny in-process fake server standing in for the real API — no Claude call, no real DB, no Telegram |
| `first-tool.ts`, `hello.ts` | Early build-guide steps, kept for reference |

There's no `mock-data.ts`, `guardrails.ts`, or `email.ts` anymore — every
tool calls Todor's real Agent API (api.md's "Agent API" section), which now
covers the full catalog, warehouse, orders, visits, and suggestions, with
every rule checked server-side against real data. Nothing in `agent/` can
run without that API reachable — see "How to run it" below.

## Required `.env` keys (names only)

```
ANTHROPIC_API_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_STOCKER_CHAT_ID
TELEGRAM_APPROVER_CHAT_ID
APP_URL
```

`RESEND_API_KEY`/`RESEND_FROM`/`SUPPLIER_DEMO_EMAIL` used to live here too,
but supplier emails are sent server-side now (`src/lib/data/orders.ts`,
using each supplier's own real address) — those are the main app's env
vars to set, not this agent's.

`.env` is gitignored and never read or printed by the agent's own tooling.

## How to run it

```bash
# One nightly run, printing each step and the final summary. Needs APP_URL
# pointed at a running instance of the main app (real DB behind it) —
# every tool calls its Agent API now, there's no offline/mock mode left.
node --env-file=.env agent.ts

# Force a 35°C heatwave forecast, to reliably demo the weather-adjustment behavior
DEMO_HEATWAVE=1 node --env-file=.env agent.ts

# The Telegram bot — run in its own terminal, left running continuously
node --env-file=.env bot.ts

# Tests (no API calls, no Claude, no Telegram — test-tools-live.ts talks to
# its own localhost-only fake server, not a real network call)
node test-tools-live.ts
```

## Guardrails (enforced server-side, not by the AI)

The server is the final word — `tools.ts` doesn't re-check any of this
locally, it just relays what the API says:

- **Orders** (`POST /api/orders`): supplier must be approved; each product
  must be carried by that supplier; quantity is a whole number 1–1000; a
  batch can't outlast the product's shelf life given real fleet-wide sales
  over the last 4 weeks; the order can't push the warehouse over capacity;
  the total must meet the supplier's minimum. Any failure returns
  `rejected` with every reason that applied. Orders over €300
  (`AUTO_APPROVE_LIMIT_EUR`, read from the environment server-side) wait for
  a human tap on an "Approve" button before being emailed; everything else
  is emailed to the supplier automatically.
- **Suggestions** (`POST /api/suggestions`): never applied automatically —
  only ever stored as `pending`, `accepted`, or `rejected`. At most 5 per
  night. `price_change` suggestions are capped at ±15% and must name a
  product the machine actually sells. The referenced machine and product
  must exist.
- **Visits** (`POST /api/visits`): a load list can't exceed the machine's
  slot capacity for that product; re-planning the same day replaces the
  existing plan.
- **Telegram button taps**: only accepted from the two known chat IDs;
  every tap gets answered so the button stops spinning. Each tap is one
  direct call to the real API (`visit-done`, `orders/:id/approve`,
  `suggestions/:id/accept|reject`) — accepting/rejecting a suggestion only
  flips its stored status, it never touches prices, stock, or orders. A
  repeated tap is safe either way: each of those calls is already
  idempotent server-side (a second "Done" finds no planned visit left to
  complete, a second "Approve" just returns the already-approved order,
  a second Accept/Reject gets a 409).

## Telegram: webhook vs. polling (pick one, never both)

Telegram delivers button taps to a bot **one way at a time** — webhook or
long-polling, never both. There are two ways to receive them, and only one
should be active:

- **Webhook** (`src/app/api/telegram/webhook/route.ts`) — Telegram POSTs
  each tap straight to the running app, which handles it inline (no
  separate process). Needs a public HTTPS URL, so this is for the deployed
  app (Vercel), not plain `next dev` on localhost.
- **Polling** (`agent/bot.ts`) — this agent calls `getUpdates` in a loop,
  left running in its own terminal. Works anywhere, including localhost,
  since Telegram never has to reach it — this agent reaches out instead.

**To switch to the webhook** (once the app is deployed somewhere with a
public HTTPS URL):

```bash
# Stop bot.ts first if it's running — see below for why.
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook?url=$APP_URL/api/telegram/webhook&secret_token=$TELEGRAM_WEBHOOK_SECRET"
```

`TELEGRAM_WEBHOOK_SECRET` is already in `.env.example` (any random string —
it's checked against Telegram's `x-telegram-bot-api-secret-token` header so
only real Telegram requests get processed); set it in the deployment's env
vars, matching what you pass to `setWebhook` above. `APP_URL` must be the
real public URL, not `http://localhost:3000`.

Once registered, **stop running `bot.ts`** — its `getUpdates` calls will
start failing (Telegram returns a 409 "can't use getUpdates while webhook
is active" error) the moment the webhook is set, which is expected, not a
bug, but it'll spam retries in its terminal forever if left running.

**To switch back to polling** (e.g. for local dev without a public URL):

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/deleteWebhook"
```

Then `node --env-file=.env bot.ts` works again. Check which mode is
currently active any time with:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
```

(an empty `"url"` in the response means polling mode; a non-empty one
means the webhook is registered and `bot.ts` won't receive anything).

## Known gaps

- `create_suggestion` and `notify_stocker` always send a Telegram message on
  success (there's no "pending suggestion" or "planned route" that doesn't
  notify someone) — `test-tools-live.ts` can only exercise their
  rejection/error paths without live Telegram credentials, not a full
  success round-trip.
- The dashboard's "run night" button spawns a real `node agent.ts`
  process (`src/app/api/agent/run-night` → `src/app/api/agent/runs/[id]`,
  reading `runs/<runId>.json` as it's written). It needs
  `NEXT_PUBLIC_AGENT_LIVE=true` to be used instead of the scripted mock, and
  only works where that Node process can spawn and outlive a child process
  for a few minutes — true for `next dev`/`next start`, not guaranteed on
  Vercel's serverless functions. The run's orders and visits are real now
  (persisted via the Agent API), but the dashboard's `GET /api/orders` /
  `GET /api/visits` calls would need to actually be re-checked against a
  live run to confirm they show up correctly end-to-end.
