# API contract (task S3)

Every endpoint the dashboard and the agent use. The exact JSON shapes are TypeScript types in [`src/lib/api-types.ts`](src/lib/api-types.ts). Example responses are in [`src/mocks/index.ts`](src/mocks/index.ts).

**Every data endpoint below is real** (A6): it reads the Supabase dev database through `src/lib/data/`. Only Viktor's agent and Telegram routes are still stubs until B1/B6 land. The frontend switches from its own mocks to these with `NEXT_PUBLIC_USE_MOCK=false`.

**Conventions**
- JSON in, JSON out. Errors return `{ "error": "message" }` with a 4xx/5xx status.
- Times are ISO 8601 UTC strings (`2026-10-10T15:42:07Z`). Days are `YYYY-MM-DD`. Money is euros as a number (`2.5`).
- IDs are readable strings where we choose them (`SOF-GYM-01`, `SOF-GYM-01-A1`, `water-500`, `sup-drinks`) and cuids where the database does (orders, visits, runs).
- No auth in demo mode.
- **"Today" is the simulated day** (`SimState.today`, starts at 2026-10-10), not the real date. Fast-forward moves it on; `npm run db:seed` resets everything to day 0.

## Endpoints

| Method and path | Returns (type) | Used by | Real version | Status |
| --- | --- | --- | --- | --- |
| `GET /api/health` | `{ ok, db }` | everyone | done | real |
| `GET /api/machines` | `MachineSummary[]` | C2 fleet overview, agent | A6 (alerts: stock-out, expiring, cash mismatch, zero sales, offline) | real |
| `GET /api/machines/:id` | `MachineDetail` | C3 machine detail | A4 + A6 | real |
| `GET /api/machines/:id/sales?days=60` | `MachineSales` | C3 sales chart | A6 | real |
| `GET /api/machines/:id/forecast` | `MachineForecast` | C3, agent `forecast` tool | A5 (`adjusted`/`reason` are B4's) | real |
| `GET /api/orders` | `PurchaseOrder[]` | C5 orders list | A6 | real |
| `POST /api/orders/:id/approve` | `PurchaseOrder` | C5, Telegram approve button | A6 (`approveOrder()`; email is B7) | real |
| `GET /api/visits?date=YYYY-MM-DD` | `Visit[]` (route order) | C4, Telegram load list | A6; without `date`, the next day with planned stops | real |
| `POST /api/visits/:id/done` | `Visit` | Telegram "done" button, C4 | A4 (`completeVisit()`) | real |
| `POST /api/agent/run-night` | `RunNightResponse` (202) | C4 "run night" button | B1 | stub |
| `GET /api/agent/runs/:id` | `AgentRun` | C4 live step stream | B1 | stub |
| `POST /api/sim/fast-forward?days=7` | `FastForwardResponse` | C6 "fast-forward" button | A7 (1–14 days, ~2–4 s per day) | real |
| `GET /api/benchmark` | `Benchmark` | C6 results chart | A8 (last fast-forward's result, or a dry run of the next 7 days) | real |
| `GET /api/investors/:id/statement?month=2026-10` | `InvestorStatement` | C7 investor view (`inv-01`, `inv-02`) | A6 | real |
| `POST /api/ingest/sale` | `{ id }` (201, 200 on retry) | simulator, real card readers | S4 + A4 (takes one unit from stock) | real |
| `POST /api/telegram/webhook` | `{ ok }` | Telegram servers | B6 | stub |

## How the pieces call each other

**Run night (C4):**
1. The dashboard calls `POST /api/agent/run-night` and gets back `{ runId }` immediately (status 202).
2. The agent keeps working in the background, appending each step to `AgentRun.steps`.
3. The dashboard polls `GET /api/agent/runs/:id` about every second and renders new steps until `status` is no longer `RUNNING`.
4. Then it shows the decisions, `GET /api/orders` and `GET /api/visits?date=<tomorrow>`.

**Stocker "done" (B6 → A6):** the stocker taps "done" in Telegram. Telegram calls `POST /api/telegram/webhook`, and the bot runs the same logic as `POST /api/visits/:id/done`. That marks the visit `DONE` and adds each load-list line as a new `StockLevel` batch.

**Big order (B5 → B6 → C5):** `create_purchase_order` sets `AWAITING_APPROVAL` when the total is over €300 (`AUTO_APPROVE_LIMIT_EUR`). The bot sends an approve button. Tapping it calls the same logic as `POST /api/orders/:id/approve`, which sets `APPROVED`, then `SENT` once the email goes out (B7).

**Agent tools (B2) → data (A):** the agent's tools should call Todor's functions directly, not over HTTP. The routes above are for the dashboard and Telegram:

| Need | Function |
| --- | --- |
| Stock per slot, with expiry and stock-outs | `machineSlotStock(machineId, at)` and `loadStock()` in `src/lib/data/stock.ts` |
| Forecast | `computeBaseline(asOf)` + `expectedUnits(baseline, slotId, from, until)` in `src/lib/data/forecast.ts` |
| Weather and holidays (B4) | `weatherOn(day)`, `holidayOn(day)` in `src/lib/sim/calendar.ts`, the same world the demand comes from |
| Approve an order / finish a stop | `approveOrder(id, by)` in `src/lib/data/fleet.ts`, `completeVisit(id)` in `src/lib/data/stock.ts` |
| Cash check (B8 alerts) | `cashChecks(machineId)` in `src/lib/data/cash.ts` |
| Today (simulated) | `getSimToday()` in `src/lib/data/sim-clock.ts` |

**Fast-forward and the agent (A7 ↔ B1):** fast-forward runs a night planner each simulated night. Until Viktor's agent is plugged in it uses a rule-based stand-in (`ruleBasedPlanner` in `src/lib/sim/planner.ts`). To use the real agent, implement `NightPlanner` (`plan(ctx) → { visits, adjustments, decisions, explanation }`) and pass it to `fastForward({ days, planner })`; the benchmark then measures it.

## Sale event format (task S4)

Sales arrive as card-reader transactions (Nayax/Vendon style), defined in [`src/lib/sale-event.ts`](src/lib/sale-event.ts):

```json
{
  "TransactionId": "sim-20261010-SOF-GYM-01-000123",
  "MachineId": "SOF-GYM-01",
  "MachineName": "Gym Lozenets",
  "ProductSelection": "A1",
  "ProductName": "Devin water 0.5 l",
  "SettlementValue": 1.8,
  "CurrencyCode": "EUR",
  "PaymentMethod": "Credit Card",
  "AuthorizationDateTimeGMT": "2026-10-10T15:42:07Z",
  "Simulated": true
}
```

`toSaleEventRow()` maps this to a `SaleEvent` row. The simulator (A3) produces exactly this shape. Then switching to a real machine only means pointing its reader's webhook at `POST /api/ingest/sale`; nothing else changes.

## Changing the contract

1. Edit the type in `src/lib/api-types.ts` and the mock in `src/mocks/index.ts`.
2. Post the change in the team chat. TypeScript then shows everyone what broke.
3. Update this table if an endpoint is added or removed.
