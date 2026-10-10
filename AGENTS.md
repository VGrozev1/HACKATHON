<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project: Vending AI Agent (hackathon)

Read `README.md` (setup, who owns what) and `api.md` (API contract) first.

- **Stack:** Next.js 16 App Router + TypeScript, Prisma 7 on Supabase Postgres, Tailwind + shadcn/ui, Recharts, Claude API (`@anthropic-ai/sdk`), grammY (Telegram), Resend (email).
- **Data model:** `prisma/schema.prisma`. After a schema change: `npm run db:migrate -- --name <change>` and commit the migration. Import the client only from `src/lib/db.ts`.
- **API shapes:** `src/lib/api-types.ts` is the contract. Routes must return exactly these types; mocks live in `src/mocks/index.ts`. Change the type first, then the route.
- **Sale events:** card-reader format in `src/lib/sale-event.ts` (S4). Don't change field names; they mirror real readers.
- **Ownership:** Todor = `prisma/`, `src/lib/sim/`, data routes. Viktor = `src/lib/agent/`, `src/lib/integrations/`, `/api/agent`, `/api/telegram`. Kalin = `src/app/` pages and `src/components/`. Work on your own branch, merge via PR.
- **Guardrails belong in code** (B5): the €300 auto-approve limit, approved suppliers, warehouse capacity and expiry checks live inside `create_purchase_order`, not only in the prompt.
- **Safety:** only ever point the Supabase MCP at the dev project. Never commit `.env` or paste keys into chat.
- Before pushing: `npm run typecheck && npm run lint && npm run build`.
