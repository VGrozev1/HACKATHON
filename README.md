# Vending AI Agent

Hackathon web app: an AI agent plans the nightly orders and restocking route for a fleet of 20 vending machines in Sofia, messages the stocker on Telegram, and emails suppliers.

| Person | Role | Owns |
| --- | --- | --- |
| Todor (A) | Data and backend | Database, simulated fleet and sales, forecast, API, benchmark |
| Viktor (B) | AI agent and integrations | Agent loop and tools, guardrails, Telegram bot, supplier email |
| Kalin (C) | Frontend and demo | Dashboard, "run night" and "fast-forward" views, investor view, pitch |

**Key files:** [`docs/PLAN.md`](docs/PLAN.md) (build plan and task ids) · [`api.md`](api.md) (API contract) · [`prisma/schema.prisma`](prisma/schema.prisma) (data model) · [`src/lib/api-types.ts`](src/lib/api-types.ts) (JSON shapes) · [`src/mocks/index.ts`](src/mocks/index.ts) (fake data) · [`src/lib/sale-event.ts`](src/lib/sale-event.ts) (sale event format)

## Get started (each person)

```bash
git clone https://github.com/VGrozev1/HACKATHON.git
cd HACKATHON
npm install
cp .env.example .env   # then paste the shared values (ask the team; never commit .env)
npm run dev            # http://localhost:3000
```

`npm install` also generates the Prisma client. Everything runs on mock data even before the database is connected; `GET /api/health` says whether the database is reachable.

Then switch to your own branch:

```bash
git checkout todor/data      # or viktor/agent, kalin/frontend
```

Branches are `<name>/<topic>`. Merge into `main` through pull requests. Pull `main` into your branch at each checkpoint.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app locally |
| `npm run typecheck` | Type-check everything (run before pushing) |
| `npm run lint` / `npm run build` | Lint / production build |
| `npm run db:migrate -- --name <change>` | Apply schema changes to the dev database and create a migration (commit it) |
| `npm run db:seed` | Seed the demo fleet (A2) |
| `npm run db:studio` | Browse the database in the browser |

**First time only, once `.env` has the database strings (one person):** `npx prisma migrate resolve --applied 20261010000000_init`. The schema was applied directly in Supabase, and this tells Prisma it is already there. Without it, the next `db:migrate` would offer to wipe the database.

## Accounts and keys (S1)

These are created by hand once. The person in the second column creates the account and shares the key with the team privately.

| Service | Who | Where | Goes into `.env` |
| --- | --- | --- | --- |
| GitHub repo | done | github.com/VGrozev1/HACKATHON | — |
| Supabase (dev project) | done | project `vending-agent-dev` (ref `wswjqtipgwtjdsnxqvcu`, Frankfurt); schema already applied. Todor: Project Settings → Database → Reset password, then the **Connect** button → ORMs → Prisma for both strings | `DATABASE_URL`, `DIRECT_URL` |
| Vercel | Kalin | vercel.com → Import the GitHub repo | add all `.env` values under Project → Settings → Environment Variables |
| Claude API | Viktor | console.anthropic.com → API keys | `ANTHROPIC_API_KEY` |
| Telegram bot | Viktor | message @BotFather in Telegram → `/newbot` | `TELEGRAM_BOT_TOKEN` |
| Resend | Viktor | resend.com → API keys | `RESEND_API_KEY` |
| Demo inbox | anyone | a new team Gmail address | `SUPPLIER_DEMO_EMAIL` |

## MCP servers for your AI editor

The repo ships the config: `.mcp.json` for Claude Code, `.cursor/mcp.json` for Cursor. Pull `main`, open the project, approve the servers when asked, then sign in to each one: in Claude Code run `/mcp`, pick a server and choose Authenticate; in Cursor use Settings → MCP. Every sign-in uses **your own** account.

| Server | What the AI does with it | Needs |
| --- | --- | --- |
| Supabase | Schema, migrations, SQL, logs on the dev database | An invite to the Supabase org (see below) |
| Vercel | Deploys, env vars, build and runtime logs | Access to the Vercel project (see below) |
| GitHub | Issues, branches, PRs, reviews | Your GitHub account (collaborator on the repo) |
| Context7 | Current docs for Next.js, Prisma, grammY, the Claude API | Nothing |
| shadcn | Finds and installs UI components | Nothing |
| Playwright | Clicks through the app in a real browser | Nothing |
| Next.js devtools | Reads the running dev server: errors, routes, logs, compile issues | `npm run dev` running |
| Prisma | Migration status, `migrate dev`, Studio | `.env` with the database strings |

**Supabase access.** The dev project lives in Todor's Supabase org, next to unrelated projects. The MCP config is locked to `vending-agent-dev`, but an org invite still lets people see the others in the dashboard. Only invite whoever needs it (Todor owns the database, so usually nobody else does). Everyone else uses the database through Prisma and `.env`.

**Vercel access.** Vercel's free Hobby plan has no team members, so only the project owner can use the Vercel MCP. Either the owner handles deploys and shares logs, or they create a Vercel team (Pro, 14-day free trial) and invite the others.

**Safety rule:** point the Supabase MCP only at the **dev** project; it can run any SQL. Let Vercel deploy previews freely, but promote to production yourselves. Keep keys in `.env`, never in chat or Git.

## Project layout

```
prisma/
  schema.prisma        data model (S2): change only together
  seed.ts              demo fleet (A2)
src/
  app/
    page.tsx           starter page (Kalin replaces with the dashboard)
    api/               all endpoints from api.md, serving mocks until replaced
  components/ui/       shadcn components
  lib/
    db.ts              the one Prisma client
    api-types.ts       API contract types (S3)
    sale-event.ts      card-reader sale event format (S4)
  mocks/index.ts       fake responses for every endpoint
```

Suggested places for new code: `src/lib/sim/` (Todor: generator, stock model, forecast, benchmark), `src/lib/agent/` (Viktor: loop, tools, prompt in `agent-prompt.md`), `src/lib/integrations/` (Viktor: Telegram, Resend), `src/app/(dashboard)/` (Kalin: screens).

## Checkpoints

- **Hour 8:** Todor's real API is live; Viktor and Kalin switch from mocks to real data.
- **Hour 14:** "Run night" works end to end: agent → orders → Telegram load list → supplier email → dashboard.
- **Hour 20:** Feature freeze. Only bug fixes, the deck and rehearsal after this.
