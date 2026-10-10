// GET /api/machines/:id/sales/products?date=YYYY-MM-DD — units sold per product
// on one (simulated) day, so the agent can compare its forecast with reality.
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { machineExists } from "@/lib/data/agent-api";
import { getSimToday } from "@/lib/data/sim-clock";
import { addDays, sofiaTime } from "@/lib/sim/calendar";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/machines/[id]/sales/products">) {
  const { id } = await ctx.params;
  const date = req.nextUrl.searchParams.get("date") ?? (await getSimToday());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  if (!(await machineExists(id))) return Response.json({ error: `Unknown machine id "${id}"` }, { status: 404 });
  const rows = await db.saleEvent.groupBy({
    by: ["productId"],
    where: { machineId: id, occurredAt: { gte: sofiaTime(date, 0), lt: sofiaTime(addDays(date, 1), 0) } },
    _count: true,
  });
  const products = await db.product.findMany({ where: { slots: { some: { machineId: id } } } });
  const sold = new Map(rows.map((r) => [r.productId, r._count]));
  return Response.json({
    machine_id: id,
    date,
    products: products.map((p) => ({ product: p.name, product_id: p.id, units: sold.get(p.id) ?? 0 })),
  });
}
