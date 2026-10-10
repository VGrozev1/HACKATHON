// GET /api/machines/:id/forecast — 4-week weekday baseline until the next visit (A5),
// plus 14 days of forecast vs actual (dashboard). With ?days=1-7: the agent's
// forecast tool shape, per product for the next N days.
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { agentForecast, machineForecast } from "@/lib/data/forecast";
import { getSimToday } from "@/lib/data/sim-clock";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/machines/[id]/forecast">) {
  const { id } = await ctx.params;
  if (!(await db.machine.findUnique({ where: { id }, select: { id: true } }))) {
    return Response.json({ error: `Unknown machine id "${id}"` }, { status: 404 });
  }
  const daysParam = req.nextUrl.searchParams.get("days");
  if (daysParam !== null) {
    const days = Number(daysParam);
    if (!Number.isInteger(days) || days < 1 || days > 7) {
      return Response.json({ error: "days must be a whole number from 1 to 7" }, { status: 400 });
    }
    return Response.json(await agentForecast(id, await getSimToday(), days));
  }
  return Response.json(await machineForecast(id, await getSimToday()));
}
