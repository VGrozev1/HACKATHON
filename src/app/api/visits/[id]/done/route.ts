// POST /api/visits/:id/done — stocker finished a stop: mark visit DONE and add the
// load list to stock. Called by the Telegram webhook (B6) and the dashboard. Stub: A6.
import type { NextRequest } from "next/server";
import { mockVisits } from "@/mocks";

export async function POST(_req: NextRequest, ctx: RouteContext<"/api/visits/[id]/done">) {
  const { id } = await ctx.params;
  const visit = mockVisits.find((v) => v.id === id);
  if (!visit) return Response.json({ error: "Visit not found" }, { status: 404 });
  return Response.json({ ...visit, status: "DONE", doneAt: new Date().toISOString() });
}
