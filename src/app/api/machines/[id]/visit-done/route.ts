// POST /api/machines/:id/visit-done — the stocker finished this machine (the
// Telegram button sends done:<machineId>): completes its next open visit,
// loads the stock and takes the units out of the warehouse.
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { machineExists } from "@/lib/data/agent-api";
import { toVisitDto } from "@/lib/data/fleet";
import { completeNextVisit } from "@/lib/data/visits";

export async function POST(_req: NextRequest, ctx: RouteContext<"/api/machines/[id]/visit-done">) {
  const { id } = await ctx.params;
  if (!(await machineExists(id))) return Response.json({ error: `Unknown machine id "${id}"` }, { status: 404 });
  const visit = await completeNextVisit(id);
  if (!visit) return Response.json({ error: `No planned visit for ${id}` }, { status: 409 });
  return Response.json(toVisitDto(await db.visit.findUniqueOrThrow({ where: { id: visit.id }, include: { machine: true } })));
}
