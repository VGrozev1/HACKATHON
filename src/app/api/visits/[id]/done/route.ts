// POST /api/visits/:id/done — the stocker finished a stop: pull expired items,
// load the load list into stock, mark the visit DONE (A4/A6). The Telegram "done"
// button (B6) calls completeVisit() too.
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { completeVisit } from "@/lib/data/stock";
import { toVisitDto } from "@/lib/data/fleet";

export async function POST(_req: NextRequest, ctx: RouteContext<"/api/visits/[id]/done">) {
  const { id } = await ctx.params;
  const visit = await completeVisit(id);
  if (!visit) return Response.json({ error: "Visit not found" }, { status: 404 });
  return Response.json(toVisitDto(await db.visit.findUniqueOrThrow({ where: { id }, include: { machine: true } })));
}
