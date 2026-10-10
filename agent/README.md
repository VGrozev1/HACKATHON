# Vending AI — night-shift agent

An AI agent that runs the nightly restocking routine for a small fleet of
vending machines: checks stock and alerts, adjusts forecasts for weather and
holidays, plans a delivery route, places supplier orders, raises suggestions
for the manager, and notifies the stocker — all over Telegram and email, with
guardrails enforced in code rather than left to the model's judgement.

## What it does, step by step

Defined in [`prompt.md`](prompt.md) (the system prompt) and executed by
[`agent.ts`](agent.ts)'s `runNight()`:

1. List all machines.
2. Check for alerts (offline, sudden zero sales, cash mismatches) and explain
   the likely cause of each.
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
| `tools.ts` | Every tool definition + implementation + the `runTool` dispatcher |
| `mock-data.ts` | The fake fleet (machines, warehouse, suppliers, products, stock, sales) used when `USE_MOCK=1` |
| `guardrails.ts` | `checkOrder` and `checkSuggestion` — the business rules, enforced in code, not left to the AI |
| `api.ts` | Thin `fetch` helper for Todor's real API (`apiGet`/`apiPost`), throws a clear error on failure |
| `email.ts` | Emails an approved purchase order to its supplier via Resend |
| `telegram.ts` | Low-level Telegram Bot API helper (`sendTelegram` with optional buttons) |
| `bot.ts` | Long-polls Telegram for button taps (Done / Approve / Accept / Reject) — run this in its own terminal, continuously |
| `misses.ts` | Reads yesterday's forecast, compares to (simulated) actual sales, surfaces the 3 biggest misses into tonight's run |
| `test-guardrails.ts` | 5 scenario tests for `checkOrder` — no Claude call |
| `test-tools.ts` | Smoke tests for the mock-backed tools — no Claude call |
| `first-tool.ts`, `hello.ts` | Early build-guide steps, kept for reference |

## Required `.env` keys (names only)

```
ANTHROPIC_API_KEY
RESEND_API_KEY
RESEND_FROM
SUPPLIER_DEMO_EMAIL
TELEGRAM_BOT_TOKEN
TELEGRAM_STOCKER_CHAT_ID
TELEGRAM_APPROVER_CHAT_ID
APP_URL
```

`.env` is gitignored and never read or printed by the agent's own tooling.

## How to run it

```bash
# One nightly run, printing each step and the final summary
node --env-file=.env agent.ts

# Same, but against mock-data.ts instead of Todor's real API
USE_MOCK=1 node --env-file=.env agent.ts

# Force a 35°C heatwave forecast, to reliably demo the weather-adjustment behavior
DEMO_HEATWAVE=1 node --env-file=.env agent.ts

# The Telegram bot — run in its own terminal, left running continuously
node --env-file=.env bot.ts

# Tests (no API calls, no Claude, no network)
node test-guardrails.ts
node test-tools.ts
```

## Guardrails (enforced in code, not by the AI)

- **Orders**: supplier must be on the approved list; each product must be
  carried by that supplier; quantity is a whole number 1–1000; a batch can't
  outlast the product's shelf life given fleet-wide daily sales; the order
  can't push the warehouse over capacity; the total must meet the supplier's
  minimum. Any failure returns `rejected` with every reason that applied —
  never a silent guess. Orders over €300 (`AUTO_APPROVE_LIMIT_EUR`) require a
  human tap on an "Approve" button before anything is emailed.
- **Suggestions**: never applied automatically — only ever stored as
  `pending`, `accepted`, or `rejected`. At most 5 per night. `price_change`
  suggestions are capped at ±15% and must name a product actually carried.
  The referenced machine and product must exist.
- **Telegram button taps** (`bot.ts`): only accepted from the two known chat
  IDs; a repeated tap on the same button is a no-op; every tap gets answered
  so the button stops spinning. Accepting/rejecting a suggestion only flips
  its stored status — it never touches prices, stock, or orders.

## Known gaps

- Only `list_machines` and `get_stock` currently call Todor's real API
  (`USE_MOCK` unset); the rest of the tools are still mock-only pending the
  real endpoints.
- The dashboard's "run night" button now spawns a real `node agent.ts`
  process (`src/app/api/agent/run-night` → `src/app/api/agent/runs/[id]`,
  reading `runs/<runId>.json` as it's written). It needs
  `NEXT_PUBLIC_AGENT_LIVE=true` to be used instead of the scripted mock, and
  only works where that Node process can spawn and outlive a child process
  for a few minutes — true for `next dev`/`next start`, not guaranteed on
  Vercel's serverless functions. The run's orders and visits aren't written
  to the app's database yet, so the dashboard's Orders/Route views won't
  show them after a real run — only the live steps and final summary do.
- `misses.ts` simulates "actual" sales (random variance around the forecast)
  because Todor's API doesn't expose per-product daily actuals yet.
