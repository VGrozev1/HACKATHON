// GET /api/machines/:id/forecast — baseline (A5) + agent adjustment (B4). Stub: A6.
import type { NextRequest } from "next/server";
import { mockMachineForecast } from "@/mocks";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/machines/[id]/forecast">) {
  const { id } = await ctx.params;
  return Response.json(mockMachineForecast(id));
}
