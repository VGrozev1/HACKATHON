// POST /api/orders/:id/approve — approve an order over €300 (dashboard or Telegram). Stub: B5/B6.
import type { NextRequest } from "next/server";
import { mockOrders } from "@/mocks";

export async function POST(_req: NextRequest, ctx: RouteContext<"/api/orders/[id]/approve">) {
  const { id } = await ctx.params;
  const order = mockOrders.find((o) => o.id === id);
  if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
  return Response.json({ ...order, status: "APPROVED" });
}
