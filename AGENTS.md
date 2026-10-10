<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project: Vending AI Agent (hackathon)

An AI agent that plans the nightly orders and restocking route for 20 simulated vending machines in Sofia, messages the stocker on Telegram, and emails suppliers. 24-hour hackathon, three people.

**Read first:**
- `docs/PLAN.md`: the build plan. Every task id used in code and comments (S1–S4, A1–A9, B1–B9, C1–C9) is defined there, with dependencies, the timeline and the demo checklist ("Definition of done").
- `api.md`: every endpoint, which task replaces each stub, and how the pieces call each other.
- `README.md`: setup, scripts, accounts, branches.

### Team and ownership

| Person | Tasks | Owns |
| --- | --- | --- |
| Todor | A1–A9 (data, simulation, backend) | `prisma/`, `src/lib/sim/`, `src/lib/data/`, data routes in `src/app/api/` |
| Viktor | B1–B9 (agent, integrations) | `src/lib/agent/`, `src/lib/integrations/`, `src/app/api/agent/`, `src/app/api/telegram/` |
| Kalin | C1–C9 (frontend, demo) | `src/app/` pages, `src/components/` |

Branches are `<name>/<topic>` (`todor/data`, `viktor/agent`, `kalin/frontend`); merge to `main` through PRs. Don't edit another person's area without telling them.

### Stack

Next.js 16 App Router + TypeScript, Prisma 7 (with `@prisma/adapter-pg`) on Supabase Postgres, Tailwind 4 + shadcn/ui, Recharts, Claude API (`@anthropic-ai/sdk`, model from `ANTHROPIC_MODEL`), grammY (Telegram), Resend (email), Vercel (hosting).

### Database

- **Schema:** `prisma/schema.prisma` is the source of truth (task S2). Its header comment lists the conventions: money is € as Float, times are UTC, ids are readable strings where we choose them.
- **Live database:** Supabase project `vending-agent-dev` (ref `wswjqtipgwtjdsnxqvcu`, eu-central-1). The `init` migration is applied. It's a dev project only; nothing real lives there.
- **Changing the schema:** edit `schema.prisma`, run `npm run db:migrate -- --name <change>`, commit the migration folder, and tell the team (it changes the API). Never edit an applied migration.
- **Client:** import `db` from `src/lib/db.ts` only; never create another `PrismaClient`. The client is generated into `src/generated/prisma` (gitignored; `npm install` regenerates it).
- **Timestamps** are stored as `timestamp` (no time zone) holding UTC. In raw SQL, convert to Sofia time with `("occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Sofia'`; a single `AT TIME ZONE` shifts the wrong way.
- **Demo data:** `npm run db:seed` wipes and reseeds the dev database (same data every time, sim clock back to 2026-10-10). `npm run sim:report` prints the simulation numbers without touching the database; `npm run sim:forecast-check` grades the forecast against true demand; `npm run sim:benchmark -- 7` runs agent vs fixed in memory.
- **Dev server after a schema change:** restart `npm run dev`. The cached Prisma client doesn't pick up new models on hot reload.
- **RLS** is on for every table with no policies. That blocks Supabase's public REST API on purpose; Prisma connects as the owner and is unaffected. New tables need `ALTER TABLE "X" ENABLE ROW LEVEL SECURITY;` added to their migration.
- **Prisma 7 differs from older versions:** the connection URL lives in `prisma.config.ts`, not the schema; the generator is `prisma-client` with an explicit output. The skills in `.claude/skills/prisma-*` cover the details.

### Simulator (`src/lib/sim/`)

| File | What |
| --- | --- |
| `fleet.ts` | A2: 3 suppliers, 29 products, 20 machines in Sofia, slot layouts per location type, investors |
| `calendar.ts` | Days, Sofia time, public holidays, weather. **Shared with the agent:** B4 reads holidays and `weatherOn(day)` from here, the same world the demand comes from |
| `demand.ts` | A3: hourly, weekday, holiday, season and weather effects; `expectedSlotDemand` is the true mean that the A5 forecast estimates |
| `generator.ts` | A3: `generateDay(day)` gives purchase attempts in the S4 sale event format, deterministic per day |
| `stock.ts` | In-memory stock batches: oldest sold first, expired items unsellable until pulled (waste) |
| `world.ts` | `SimWorld.runDay(day, plans)`: morning visits, then customers; tracks sales, missed purchases, waste and stock-out periods |
| `history.ts` | The fixed refill schedule (`fixedSchedulePlans`). The seed replays 60 days with it; it's also the A8 baseline |
| `planner.ts` | `NightPlanner` interface + `ruleBasedPlanner` stand-in (until Viktor's agent plugs in) |
| `benchmark.ts` | A8: both strategies from the same snapshot, same customers, same stops per day |

Demand is a pure function of the day, so reruns and both benchmark strategies see identical customers. `SIM_TODAY` (default 2026-10-10) is the last day of history; fast-forward continues from there.

### Data layer (`src/lib/data/`), used by routes and agent tools

| File | What |
| --- | --- |
| `sim-clock.ts` | `getSimToday()`: the app's "today" is the simulated day (`SimState`), not the real date |
| `stock.ts` | A4: stock batches, `consumeStock` (a sale), `completeVisit` (a stop), per-slot stock with `emptySince` |
| `forecast.ts` | A5: weekday baseline from 4 weeks, corrected for stock-outs (`StockOut` periods) |
| `fleet.ts` | A6: every dashboard query, returning `api-types.ts` shapes; alerts |
| `cash.ts` | A9: cash box vs fiscal memory per collection (2 machines have deliberate faults) |
| `fast-forward.ts` | A7: N simulated days with the night planner; stores runs, orders, visits, sales, stock |

**Benchmark result so far (honest):** with the rule-based stand-in and the same stops per day, the agent matches the fixed schedule on missed sales and cuts expired food ~17% over 28 days. Machine capacity is the binding limit for this fleet; spreading stops evenly or using fewer stops made it worse (tested). `npm run sim:benchmark -- 28` reruns it in memory.

### API contract

- `src/lib/api-types.ts` holds the exact JSON shape of every endpoint. Routes must return these types. To change a shape: edit the type, then the mock in `src/mocks/index.ts`, then the route, then tell the team.
- Every route in `src/app/api/` starts as a stub serving mocks; its header comment names the task that replaces it. Keep the response shape identical when replacing a stub.
- With `cacheComponents` on, a GET route that reads no request data is prerendered at build time. Routes serving live data call `await connection()` from `next/server` first.
- The agent's tools call the data functions in `src/lib` directly, not over HTTP.

### Sale events (S4)

`src/lib/sale-event.ts` defines the card-reader (Nayax/Vendon-style) transaction format. The simulator must emit exactly this shape, and `POST /api/ingest/sale` stores it. Don't rename its fields; they mirror real readers so real machines can plug in later.

### Agent rules (Viktor's area, but everyone should know them)

- **Guardrails belong in code** (B5): orders under €300 (`AUTO_APPROVE_LIMIT_EUR`) go out automatically, bigger ones wait for approval in Telegram. Only approved suppliers; never above `Product.warehouseCapacity`; never order stock that expires before it's likely to sell; price changes are suggestions only. These checks live inside `create_purchase_order`, not only in the prompt.
- Log every step of a run to `AgentRun.steps`; the dashboard streams it.
- Telegram: the bot sends load lists to `TELEGRAM_STOCKER_CHAT_ID` and approvals to `TELEGRAM_APPROVER_CHAT_ID`. Button taps arrive at `POST /api/telegram/webhook`, checked against `TELEGRAM_WEBHOOK_SECRET`.

### Safety

- The Supabase MCP in `.mcp.json` and `.cursor/mcp.json` is scoped to the dev project. Never point any tool at another Supabase project; the same account holds unrelated production data.
- Never commit `.env` or paste keys into chat; `.env.example` lists every variable.
- Let Vercel deploy previews freely; promotion to production is done by a person.

### Before pushing

`npm run typecheck && npm run lint && npm run build`

### Setup status (update as things land)

- [x] Repo, app scaffold, dependencies, shadcn/ui
- [x] Schema, initial migration applied to Supabase
- [x] API contract + mock endpoints, sale event format
- [x] Telegram bot created; token and chat ids in Todor's `.env`
- [x] Database connected; demo data seeded (A1–A3)
- [x] Stock model, forecast, real API, fast-forward, benchmark, cash check (A4–A9)
- [ ] Connection strings shared with Viktor and Kalin
- [x] Vercel project `vending-agent` (Todor's account, region fra1): https://vending-agent-pi.vercel.app. Deployed from the CLI (`vercel deploy --prod`); not git-linked, because the repo is under Viktor's GitHub
- [x] Vercel environment variables set (including `NEXT_PUBLIC_USE_MOCK=false`)
- **Deploying:** Vercel's free Hobby plan only deploys when the latest commit on `main` was made by Todor (the account owner); otherwise the deploy shows as BLOCKED. So Todor deploys with `vercel deploy --prod` from his machine right after one of his own commits lands on `main`.
- [x] Claude API key, Resend key, demo Gmail inbox (all set on Vercel)
- [x] Agent API for Viktor's tools (catalog, warehouse, stock, forecast?days, orders, visits, visit-done, suggestions, weather, holidays, today, per-product sales); see api.md "Agent API"
- [x] Agent tools on the real API: list_machines, get_stock, forecast, check_alerts, plan_route, weather, holidays, today
- [ ] Agent tools still to move: create_purchase_order, guardrails catalog/warehouse, notify_stocker (save visits), create_suggestion, misses.ts actuals, bot.ts buttons
- [ ] Run night on Vercel: run the agent inside the request and store its steps in the database (today it spawns `node agent.ts`, which only works locally)
