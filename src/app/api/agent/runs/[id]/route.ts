// GET /api/agent/runs/:id — a run with its steps so far (C4 polls this ~every
// second). Read from the database (AgentRun), where POST /api/agent/run-night
// stores each step as the agent produces it, so any server instance can answer.
// The agent's orders, visits and suggestions are saved through the Agent API,
// so GET /api/orders, /api/visits and /api/suggestions show them too.
import type { NextRequest } from "next/server";
import { getRunDto } from "@/lib/data/agent-runs";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/agent/runs/[id]">) {
  const { id } = await ctx.params;
  const run = await getRunDto(id);
  if (!run) return Response.json({ error: `Unknown run id "${id}"` }, { status: 404 });
  return Response.json(run);
}
