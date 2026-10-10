// GET /api/machines/:id — machine detail with stock per slot (A6).
import type { NextRequest } from "next/server";
import { getMachine } from "@/lib/data/fleet";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/machines/[id]">) {
  const { id } = await ctx.params;
  const machine = await getMachine(id);
  if (!machine) return Response.json({ error: "Machine not found" }, { status: 404 });
  return Response.json(machine);
}
