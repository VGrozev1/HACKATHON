// GET /api/machines/:id/stock — the agent's get_stock: one line per product,
// with units left (count), total slot capacity, its slots and the next expiry.
import type { NextRequest } from "next/server";
import { machineExists } from "@/lib/data/agent-api";
import { getSimToday, simNight } from "@/lib/data/sim-clock";
import { agentStock } from "@/lib/data/stock";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/machines/[id]/stock">) {
  const { id } = await ctx.params;
  if (!(await machineExists(id))) return Response.json({ error: `Unknown machine id "${id}"` }, { status: 404 });
  return Response.json(await agentStock(id, simNight(await getSimToday())));
}
