// GET /api/machines/:id/sales?days=60 — daily sales history. Stub: A6.
import type { NextRequest } from "next/server";
import { mockMachineSales } from "@/mocks";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/machines/[id]/sales">) {
  const { id } = await ctx.params;
  const days = Number(req.nextUrl.searchParams.get("days") ?? 60);
  return Response.json(mockMachineSales(id, days));
}
