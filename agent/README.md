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
| `mock-data.ts` | What's left of the fake fleet (suppliers, products, warehouse, average sales) — only what has no real endpoint yet; see below |
| `guardrails.ts` | `checkOrder` and `checkSuggestion` — the business rules, enforced in code, not left to the AI, taking their catalogs as parameters |
| `api.ts` | Thin `fetch` helper for Todor's real API (`apiGet`/`apiPost`), throws a clear error on failure |
| `email.ts` | Emails an approved purchase order to its supplier via Resend |
| `telegram.ts` | Low-level Telegram Bot API helper (`sendTelegram` with optional buttons) |
| `bot.ts` | Long-polls Telegram for button taps (Done / Approve / Accept / Reject) — run this in its own terminal, continuously |
| `misses.ts` | Reads yesterday's forecast, compares to (simulated) actual sales, surfaces the 3 biggest misses into tonight's run |
| `test-guardrails.ts` | 5 scenario tests for `checkOrder` — no Claude call |
| `test-tools.ts` | Smoke tests for the tools that still have a `USE_MOCK=1` fallback (`get_weather`, `get_holidays`) — no Claude call |
| `test-tools-live.ts` | Regression tests for the tools that always call the real API now (`list_machines`, `get_stock`, `forecast`, `plan_route`, `check_alerts`), against a tiny in-process fake server — no Claude call, no real DB |
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

# Same, but create_purchase_order/create_suggestion use mock-data.ts's
# catalogs instead of Todor's real API (list_machines, get_stock, forecast,
# plan_route, and check_alerts always call the real API regardless)
USE_MOCK=1 node --env-file=.env agent.ts

# Force a 35°C heatwave forecast, to reliably demo the weather-adjustment behavior
DEMO_HEATWAVE=1 node --env-file=.env agent.ts

# The Telegram bot — run in its own terminal, left running continuously
node --env-file=.env bot.ts

# Tests (no API calls, no Claude; test-tools-live.ts talks to its own
# localhost-only fake server, not a real network call)
node test-guardrails.ts
node test-tools.ts
node test-tools-live.ts
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

## Real data vs. mock data (`USE_MOCK`)

`mock-data.ts` has the full breakdown; in short:

- **Always real now, no `USE_MOCK` branch:** `list_machines`, `get_stock`,
  `forecast`, and `plan_route` call Todor's real `/api/machines` endpoints
  unconditionally. `check_alerts` reads the real alerts `/api/machines`
  already computes server-side — a richer set of kinds (stock-out, expiring
  food) than mock-data.ts ever modeled, so there was never a point keeping
  a separate, weaker mock implementation of it.
- `get_weather`/`get_holidays` are real in both modes, but from different
  sources depending on `USE_MOCK`: real mode uses `weatherOn`/`holidayOn`
  from `src/lib/sim/calendar.ts` — the same deterministic calendar actually
  driving the simulated economy's demand, found via `GET /api/health`'s
  `today` field (the simulated day, not the real calendar date — they can
  drift apart once fast-forward moves the sim clock on). Mock mode has no
  simulated economy to stay consistent with, so it still asks the real
  Open-Meteo API and a fixed Bulgarian holiday table instead, just for demo
  flavor. (Before this, real mode used Open-Meteo/the fixed table too —
  real weather, but for a day that had nothing to do with the actual
  simulated demand the rest of the run was reasoning about.)
- **Mock-only regardless of `USE_MOCK`** — no real source exists yet:
  - Product catalog (names, prices, shelf life) and the approved supplier
    list — no `/api/products` or `/api/suppliers` endpoint. Worse: Todor's
    real catalog (29 products) isn't even the same catalog as this file's 5
    invented ones, so this isn't just "point it at a URL" once one exists.
  - Warehouse capacity/current stock — no endpoint.
  - `create_purchase_order` only ever appends to an in-memory array; there's
    no `POST /api/orders` to persist a real one (only `GET /api/orders` and
    `POST /api/orders/:id/approve` exist for orders that already exist).
  - Average daily sales per product — feeds the shelf-life guardrail math;
    no real per-product fleet-wide rate to use instead yet.

These need either a new real endpoint (Todor) or a product/supplier catalog
that matches the real one, not a `tools.ts` change — tracked as open
questions, not bugs.

## Known gaps

- The dashboard's "run night" button spawns a real `node agent.ts`
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
- Every order, regardless of supplier, emails the same `SUPPLIER_DEMO_EMAIL`
  inbox — `mock-data.ts`'s `supplier.email` field is never actually read.
  Fine for a single-inbox demo; would need `email.ts` to use it if suppliers
  ever need to receive their own orders at their own addresses.
- `AUTO_APPROVE_LIMIT_EUR` in `guardrails.ts` is a hardcoded `300`, not read
  from `process.env.AUTO_APPROVE_LIMIT_EUR` even though `.env.example`
  documents that var and Todor's own backend (`fast-forward.ts`) does read
  it — two systems claiming to respect the same configurable limit, only
  one actually does.
