# API contract (task S3)

Every endpoint the dashboard and the agent use. The exact JSON shapes are TypeScript types in [`src/lib/api-types.ts`](src/lib/api-types.ts). Example responses are in [`src/mocks/index.ts`](src/mocks/index.ts).

**Every endpoint below already responds** with mock data, so Kalin and Viktor can build against real URLs from hour 2. Todor replaces each stub with a real database query (A6) without changing its shape. The **Status** column shows which ones are still mocks.

**Conventions**
- JSON in, JSON out. Errors return `{ "error": "message" }` with a 4xx/5xx status.
- Times are ISO 8601 UTC strings (`2026-10-10T15:42:07Z`). Days are `YYYY-MM-DD`. Money is euros as a number (`2.5`).
- IDs are readable strings where we choose them (`SOF-GYM-01`, `SOF-GYM-01-A1`, `water-500`, `sup-drinks`) and cuids where the database does (orders, visits, runs).
- No auth in demo mode.

## Endpoints

| Method and path | Returns (type) | Used by | Real version | Status |
| --- | --- | --- | --- | --- |
| `GET /api/health` | `{ ok, db }` | everyone | done | real |
| `GET /api/machines` | `MachineSummary[]` | C2 fleet overview, agent | A6 | mock |
| `GET /api/machines/:id` | `MachineDetail` | C3 machine detail | A6 | mock |
| `GET /api/machines/:id/sales?days=60` | `MachineSales` | C3 sales chart | A6 | mock |
| `GET /api/machines/:id/forecast` | `MachineForecast` | C3, agent `forecast` tool | A5 + B4 | mock |
| `GET /api/orders` | `PurchaseOrder[]` | C5 orders list | A6 | mock |
| `POST /api/orders/:id/approve` | `PurchaseOrder` | C5, Telegram approve button | B5/B6 | mock |
| `GET /api/visits?date=YYYY-MM-DD` | `Visit[]` (route order) | C4, Telegram load list | A6 | mock |
| `POST /api/visits/:id/done` | `Visit` | Telegram "done" button, C4 | A6 | mock |
| `POST /api/agent/run-night` | `RunNightResponse` (202) | C4 "run night" button | B1 | mock |
| `GET /api/agent/runs/:id` | `AgentRun` | C4 live step stream | B1 | mock |
| `POST /api/sim/fast-forward?days=7` | `FastForwardResponse` | C6 "fast-forward" button | A7 | mock |
| `GET /api/benchmark` | `Benchmark` | C6 results chart | A8 | mock |
| `GET /api/investors/:id/statement?month=2026-10` | `InvestorStatement` | C7 investor view | A6 | mock |
| `POST /api/ingest/sale` | `{ id }` (201) | simulator, real card readers | done (S4) | real |
| `POST /api/telegram/webhook` | `{ ok }` | Telegram servers | B6 | stub |

## How the pieces call each other

**Run night (C4):**
1. The dashboard calls `POST /api/agent/run-night` and gets back `{ runId }` immediately (status 202).
2. The agent keeps working in the background, appending each step to `AgentRun.steps`.
3. The dashboard polls `GET /api/agent/runs/:id` about every second and renders new steps until `status` is no longer `RUNNING`.
4. Then it shows the decisions, `GET /api/orders` and `GET /api/visits?date=<tomorrow>`.

**Stocker "done" (B6 → A6):** the stocker taps "done" in Telegram. Telegram calls `POST /api/telegram/webhook`, and the bot runs the same logic as `POST /api/visits/:id/done`. That marks the visit `DONE` and adds each load-list line as a new `StockLevel` batch.

**Big order (B5 → B6 → C5):** `create_purchase_order` sets `AWAITING_APPROVAL` when the total is over €300 (`AUTO_APPROVE_LIMIT_EUR`). The bot sends an approve button. Tapping it calls the same logic as `POST /api/orders/:id/approve`, which sets `APPROVED`, then `SENT` once the email goes out (B7).

**Agent tools (B2) → data (A):** the agent's tools should call Todor's functions directly (shared code in `src/lib`), not over HTTP. The routes above are for the dashboard and Telegram.

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
