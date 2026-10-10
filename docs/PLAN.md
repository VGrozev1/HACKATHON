# Web App Build Plan: Vending AI Agent

Oct 10, 2026 · @Viktor

The hackathon web app from the Vending-as-a-Service plan, split into tasks for three people over about 24 hours. Agree on the data model and API contract together first; then each person builds their part against simulated data, and you integrate at fixed checkpoints.

## Team and roles

Split by layer, so nobody waits on anyone after hour 2: A owns the data, B owns the AI, C owns what judges see.

| Person | Role | Owns | Best fit |
| --- | --- | --- | --- |
| Todor (A) | Data and backend | Database, simulated fleet and sales, forecast baseline, API, the agent-vs-fixed-order metric | Comfortable with SQL and TypeScript or Python |
| Viktor (B) | AI agent and integrations | LLM agent and its tools, nightly loop, guardrails, purchase orders, Telegram bot, supplier email | Mostly prompting and wiring services together with an AI coding agent |
| Kalin (C) | Frontend and demo | Operator dashboard, investor view, "run night" and "fast-forward" buttons, pitch and demo script | Likes UI; also the best presenter. The pitch tasks need no coding |

Task IDs keep their letters (A1 = Todor, B1 = Viktor, C1 = Kalin) so the timeline and dependencies stay readable.

## Stack and shared setup (hours 0–2, all three)

Use one language end to end, TypeScript, so everyone can read everyone's code. Suggested stack:

| Layer | Choice | Why |
| --- | --- | --- |
| App and API | Next.js (App Router) + TypeScript | Frontend and backend routes in one repo; one deploy |
| Database | Postgres on Supabase (free tier), Prisma ORM | Hosted in minutes; Prisma gives typed models all three share |
| UI | Tailwind + shadcn/ui, Recharts for charts | Good-looking dashboard fast |
| AI | Claude API with tool use | The agent calls your functions as tools |
| Stocker phone | Telegram bot (grammY library) | Free, instant, works on any phone |
| Supplier email | Resend (sending) to a team Gmail inbox | Judges see a real email land |
| Hosting | Vercel | Push to deploy; a public link for judges |

These are suggestions; swap any of them for what the team already knows. Python (FastAPI) for A and B's logic also works, but then plan an extra API layer.

### Do together before splitting up

- [ ] **S1. Repo and accounts** — one GitHub repo, branch per person, Vercel, Supabase, Claude API key, Telegram bot token (via BotFather), Resend key. Keys go in a shared `.env`, never in Git. *(30 min)*
- [ ] **S2. Data model** — agree the tables: `Machine` (id, name, location type, city, coordinates), `Product` (id, name, cost, price, shelf life), `Slot` (machine, product, capacity), `SaleEvent` (machine, slot, price, time, payment type), `StockLevel` (machine, slot, quantity, expiry), `Supplier`, `PurchaseOrder` + lines, `Visit` (route, machine, load list, done), `AgentRun` (date, decisions, explanation). *(45 min)*
- [ ] **S3. API contract** — write down the endpoints and their JSON shapes in a shared file (`api.md`), e.g. `GET /api/machines`, `GET /api/machines/:id/sales`, `POST /api/agent/run-night`, `POST /api/sim/fast-forward`. C builds against fake JSON until A's real endpoints exist. *(30 min)*
- [ ] **S4. Sale event format** — copy the shape of a real card-reader (Nayax/Vendon-style) sale event, so the demo can later switch to real machines without code changes. *(15 min)*

## MCP servers for building

Connect these MCP servers to your AI coding agent (Claude Code, Cursor or similar), so the AI creates the database, writes the code and deploys it, instead of you doing each step by hand. Each person connects them on their own machine during S1.

### Core: everyone needs these

| MCP server | What the AI does with it | Main user |
| --- | --- | --- |
| Supabase (official) | Creates the tables, writes and applies migrations, seeds the 20 machines and 60 days of sales, sets up auth and storage, deploys edge functions, reads logs when something breaks | Todor |
| GitHub (official) | Creates the repo, turns this task list into issues, opens branches and PRs, reviews code | Everyone |
| Vercel (official) | Deploys the Next.js app, sets environment variables, reads build and runtime logs, gives the public link for judges | Kalin |
| Context7 | Feeds the AI current docs for Next.js, Prisma, Supabase, grammY and the Claude API, so it doesn't write outdated code | Everyone |

### Recommended: these save hours

| MCP server | What the AI does with it | Main user |
| --- | --- | --- |
| shadcn/ui | Finds and installs dashboard components (tables, charts, cards) instead of hand-writing them | Kalin |
| Playwright (Microsoft) | Opens the app in a real browser, clicks "run night" and "fast-forward", and checks the demo works end to end | Kalin |
| Resend (official) | Sets up the sender, creates the API key and sends test supplier emails while building | Viktor |

### Setup order (first hour, together)

1. Create the accounts by hand: GitHub, Supabase, Vercel, Resend, Anthropic API, and a Telegram bot via BotFather (2 minutes).
2. Connect GitHub, Supabase, Vercel and Context7 in each person's AI editor.
3. Ask the AI: "Create a Supabase project with this schema" (paste the S2 data model), then "Generate a Next.js app wired to it and deploy it to Vercel".
4. Add shadcn, Playwright and Resend when Kalin and Viktor start their parts.

**Safety rule.** Use a **separate dev Supabase project** for the AI to build in. The Supabase MCP can run any SQL and apply migrations, so never point it at anything with real data. Let Vercel deploy previews freely, but promote to production yourselves. Keep API keys in `.env`, never pasted into chat or committed to Git.

Telegram, Google Maps and weather are runtime tools the agent uses during the demo, not build tools; see the tips for Viktor.

## Todor (A): data, simulation and backend

Todor makes the fake world real enough to trust: 20 machines with 60 days of believable sales, a stock model, and the API everyone else reads from.

- [ ] **A1. Database schema** — turn the S2 data model into a Prisma schema, run the first migration on Supabase. *(1 h, needs S2)*
- [ ] **A2. Seed the fleet** — 20 machines in Sofia: gyms, offices and a hospital; about 30 products with cost, price and shelf life; slot layouts per machine; 2–3 suppliers with minimum order and delivery days. *(1.5 h, needs A1)*
- [ ] **A3. Sales generator** — 60 days of sale events in the S4 format, with realistic patterns: weekday vs weekend, gym peaks after work, office peaks at lunch, a holiday dip, random noise. Write it as a function you can call for "one more day". *(3 h, needs A2)*
- [ ] **A4. Stock model** — stock = last loaded quantity minus sales since then; track expiry per batch; mark stock-outs (slot empty while demand exists). *(2 h, needs A3)*
- [ ] **A5. Forecast baseline** — average sales per product, per machine, per day of week, over the last 4 weeks. Return expected sales until the next visit. *(1.5 h, needs A3)*
- [ ] **A6. API endpoints** — machines list and detail, sales history, stock, forecast, orders, visits; matching the S3 contract. *(2 h, needs A4, A5)*
- [ ] **A7. Fast-forward simulation** — `POST /api/sim/fast-forward?days=7`: each day, run the agent's night, apply the stocker's loads, generate the next day's sales. *(2 h, needs A6 and B's agent at checkpoint 2)*
- [ ] **A8. Benchmark metric** — run the same simulated weeks twice: once with the agent, once with a fixed weekly order. Count stock-outs and expired products for each. This is the "one number" for the judges. *(2 h, needs A7)*
- [ ] **A9. Cash check (stretch)** — simulated coin collections vs fiscal totals, to feed the agent's "what's wrong" alerts. *(1 h, optional)*

### Tips for Todor

Your work is the foundation: if the data looks fake, the whole demo looks fake. Everyone else is waiting on your API at checkpoint 1, so ship a rough version early and improve it.

- **Let the Supabase MCP do the boring parts.** Paste the S2 data model and ask the AI to write the Prisma schema, apply the migration and create a seed script. Review the generated SQL before it runs; check foreign keys and indexes on `SaleEvent` (machine, time).
- **Make the sales believable, not random.** Judges will look at the charts. Give each location type its own daily shape (gym peaks 17:00–21:00, offices at 12:00–14:00, hospital flat and 24/7), lower weekend sales for offices, and 2–3 products that clearly sell best. Use a fixed random seed so every run gives the same data.
- **Generate days, not a dump.** Write the generator as `generateDay(date)` so fast-forward (A7) reuses it. This saves you a rewrite later.
- **Publish fake JSON in hour 2.** Put example responses for every endpoint in `api.md` right after S3, so Kalin and Viktor can start immediately.
- **Keep the benchmark honest.** Run the agent and the fixed weekly order on exactly the same simulated demand. If the agent only wins because the comparison is rigged, a judge will ask, and you lose credibility.
- **Watch the clock on A7.** Fast-forwarding 7 days calls the agent 7 times. Cache what you can and test how long it takes; judges won't wait more than about 30 seconds.

## Viktor (B): AI agent and integrations

Viktor builds the brain: an LLM that calls tools in a nightly loop, follows the guardrails, and talks to the outside world through Telegram and email.

- [ ] **B1. Agent skeleton** — a loop that sends the Claude API a system prompt, the tool definitions and the night's context, runs whichever tool it calls, returns the result, and repeats until it finishes. Log every step to `AgentRun`. *(2 h, needs S1)*
- [ ] **B2. Tools** — wrap A's functions as tools: `get_stock`, `forecast`, `plan_route`, `create_purchase_order`, `send_to_supplier`, `notify_stocker`. Use mock data until A6 is ready. *(3 h, needs S3)*
- [ ] **B3. Route planner** — pick machines below about 40% stock or with expiring items, then order them by distance (nearest-neighbour is enough). Output a load list per machine. *(2 h, needs B2)*
- [ ] **B4. Context adjustment** — the LLM adjusts A's baseline forecast for weather and public holidays and writes one plain-language reason per change. Use a hard-coded weather/holiday calendar for the demo. *(1.5 h, needs A5)*
- [ ] **B5. Guardrails in code, not just the prompt** — orders under €300 go out automatically; bigger ones wait for approval; approved suppliers and products only; never above warehouse capacity; never order stock that expires before it is likely to sell; price changes and swaps are suggestions only. *(2 h, needs B2)*
- [ ] **B6. Telegram bot** — sends the stocker's load list per machine with a "done" button that logs the visit; sends the one-tap approval request for big orders. *(2.5 h, needs B3, B5)*
- [ ] **B7. Supplier email** — turn each purchase order into a clean email (product, quantity, delivery date) and send it with Resend to the demo inbox. *(1 h, needs B2)*
- [ ] **B8. Alerts** — "what's wrong" checks: machine offline, sales suddenly at zero, cash vs fiscal mismatch; each with the likely cause. *(1.5 h, needs A4)*
- [ ] **B9. Learning from misses** — after each simulated day, compare forecast vs actual and feed the biggest misses back into the next night's context, so the fast-forward shows it improving. *(2 h, needs A7)*

### Tips for Viktor

Your part is the "wow" of the demo, and most of it is clear instructions plus wiring, which an AI coding agent handles well. Your job is to describe precisely what the agent should do and to test it hard.

- **Write the system prompt like a job description.** Who the agent is, what it decides each night, the rules it must never break, and the exact format of its explanations. Keep it in a file (`agent-prompt.md`) and improve it after every test run.
- **Start with one tool, end to end.** Make `get_stock` work and get the agent to call it before adding the other five. Debugging six tools at once is where hackathon hours disappear.
- **Guardrails go in code, not just in the prompt.** Ask the AI to put the €300 limit, approved suppliers, warehouse capacity and expiry checks inside `create_purchase_order` itself, so the order is rejected even if the model ignores the prompt. This is also your best security talking point for the judges.
- **Use MCP servers at runtime to save work.** Instead of writing the integrations yourself, the agent can call off-the-shelf MCP servers: Resend (official) for supplier emails, a Telegram MCP for load lists and approval buttons, a Google Maps MCP for route order, and an Open-Meteo weather MCP. Put your own business tools in one small `vending-ops` MCP server. Test each community server in the first two hours and keep a direct-API fallback.
- **The "done" button still needs a webhook.** An MCP server lets the agent send to Telegram; when the stocker taps "done", Telegram must call a small route in your app to update stock. Ask Todor for the endpoint it should hit.
- **Log everything the agent does.** Every tool call, input and result goes to `AgentRun`. Kalin streams it on screen, and it is how you find out why the agent ordered 200 Red Bulls.
- **Set a token budget.** One night for 20 machines should take a handful of tool calls. If it loops, cap the number of steps and make it summarise.

## Kalin (C): dashboards, investor view and the demo

Kalin builds everything the judges look at and owns the story. Build against fake JSON from S3 first, then switch to A's real API.

- [ ] **C1. App shell** — layout, navigation, login-free demo mode, Tailwind and shadcn/ui set up. *(1 h, needs S1)*
- [ ] **C2. Fleet overview** — all 20 machines as cards or on a map: location type, stock level bar, today's sales, alerts. *(2.5 h, needs S3)*
- [ ] **C3. Machine detail** — sales chart (last 60 days), stock per slot with expiry, forecast vs actual. *(2.5 h, needs C2)*
- [ ] **C4. "Run night" view** — the big button. While the agent runs, stream its steps; afterwards show the orders, route and load lists, each with the agent's plain-language explanation. *(3 h, needs B1)*
- [ ] **C5. Orders and approvals** — list of purchase orders with status (sent automatically, waiting for approval, approved), linked to the machines they feed. *(1.5 h, needs B5)*
- [ ] **C6. "Fast-forward a week" + results** — button plus the before/after: stock-outs and wasted products, agent vs fixed weekly order, as a simple chart. *(2 h, needs A8)*
- [ ] **C7. Investor view** — read-only page for one investor's machine: sales, costs, payout under model A, B or C, and the monthly statement. *(2 h, needs A6)*
- [ ] **C8. Pitch deck** — 5–7 slides: problem (ordering is the hidden labour), the solution, live demo, the one number, business model, team. *(2 h, no coding)*
- [ ] **C9. Demo script and rehearsal** — who clicks what, in which order, with a backup screen recording in case the Wi-Fi or an API fails. *(1.5 h, no coding)*

### Tips for Kalin

Judges remember what they see and the one number you tell them. You own both, so design every screen around the demo script, not around features.

- **Write the demo script first, in hour 2.** List the 6–8 clicks the judges will see, in order. Build only those screens; everything else is a nice-to-have.
- **Build on fake JSON from minute one.** Use Todor's example responses in `api.md` so you never wait. Switching to the real API at checkpoint 1 should be a one-line change.
- **Let shadcn and the AI do the layout.** Ask for "a fleet overview with machine cards showing a stock bar and today's sales" and refine from there. Spend your own time on the "run night" view: streaming the agent's steps live is the most impressive moment.
- **Make the agent's reasoning readable.** Show each decision as a short card ("Ordered 24 water for Gym Lozenets: hot weekend forecast, ran out last Saturday"), not raw JSON.
- **Use Playwright to rehearse.** Have the AI script the full demo click-path and run it after every merge, so you find a broken button before the judges do.
- **Prepare for failure.** Record a backup video of the full demo at the feature freeze. Bring a phone hotspot in case the venue Wi-Fi blocks Telegram or the Claude API.
- **Pitch structure:** problem (ordering is the hidden labour in vending), live demo, the one number, business model in one slide, team. Keep it under the time limit with a minute to spare.

## Timeline and checkpoints

Work alone on mocks until hour 8, wire everything together by hour 14, and stop adding features at hour 20.

Hours 0–2: shared setup (S1–S4). Hours 2–8: everyone builds on mocks. Hours 8–14: integrate. Hours 14–20: polish. Hours 20–24: freeze, deck, rehearsal.

- **Checkpoint 1 (hour 8):** A's real API is live; B's agent and C's screens switch from mocks to real data.
- **Checkpoint 2 (hour 14):** "Run night" works end to end: agent → orders → Telegram load list → supplier email → dashboard.
- **Feature freeze (hour 20):** only bug fixes, deck and rehearsal after this. Hold a 10-minute stand-up at each checkpoint.

## Definition of done: the demo checklist

The app is done when this whole run works three times in a row on the deployed link.

- [ ] Open the public link; the fleet overview shows 20 machines with stock and sales
- [ ] Open one machine; its sales chart, stock and forecast make sense
- [ ] Press "run night"; the agent's steps stream in, and it explains its orders in plain language
- [ ] The stocker's load list arrives in Telegram; pressing "done" updates the machine's stock
- [ ] A purchase order email lands in the demo inbox
- [ ] One order over €300 waits for approval, and approving it in Telegram changes its status
- [ ] Press "fast-forward a week"; the agent beats the fixed weekly order on stock-outs and waste
- [ ] The investor view shows one machine's statement and payout
- [ ] A backup screen recording of the full demo exists

Cut first if time runs short: A9 cash check, B8 alerts, B9 learning from misses, C7 investor view. Never cut the "run night" view, Telegram and the benchmark number.
