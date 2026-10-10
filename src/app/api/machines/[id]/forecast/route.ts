// GET /api/machines/:id/forecast — 4-week weekday baseline until the next visit (A5),
// plus 14 days of forecast vs actual. `adjusted`/`reason` are filled by the agent (B4).
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { machineForecast } from "@/lib/data/forecast";
import { getSimToday } from "@/lib/data/sim-clock";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/machines/[id]/forecast">) {
  const { id } = await ctx.params;
  if (!(await db.machine.findUnique({ where: { id }, select: { id: true } }))) {
    return Response.json({ error: "Machine not found" }, { status: 404 });
  }
  return Response.json(await machineForecast(id, await getSimToday()));
}
