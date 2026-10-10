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
- **Telegram button taps** (`bot.ts`): only accepted from the two known chat
  IDs; a repeated tap on the same button is a no-op; every tap gets answered
  so the button stops spinning. Each tap is one direct call to the real API
  (`visit-done`, `orders/:id/approve`, `suggestions/:id/accept|reject`) —
  accepting/rejecting a suggestion only flips its stored status, it never
  touches prices, stock, or orders.

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
