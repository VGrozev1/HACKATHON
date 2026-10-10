// GET /api/machines/:id/sales?days=60 — daily sales history and top products (A6).
import type { NextRequest } from "next/server";
import { getMachineSales } from "@/lib/data/fleet";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/machines/[id]/sales">) {
  const { id } = await ctx.params;
  const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get("days") ?? 60) || 60));
  const sales = await getMachineSales(id, days);
  if (!sales) return Response.json({ error: "Machine not found" }, { status: 404 });
  return Response.json(sales);
}
