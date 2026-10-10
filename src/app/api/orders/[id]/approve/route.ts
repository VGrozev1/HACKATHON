// POST /api/orders/:id/approve — approve an order waiting for approval (over the
// auto-approve limit). Sending the email afterwards is B7; the Telegram button (B6)
// calls approveOrder() too.
import type { NextRequest } from "next/server";
import { approveOrder } from "@/lib/data/fleet";

export async function POST(_req: NextRequest, ctx: RouteContext<"/api/orders/[id]/approve">) {
  const { id } = await ctx.params;
  const order = await approveOrder(id);
  if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
  return Response.json(order);
}
