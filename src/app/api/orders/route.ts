// GET /api/orders — purchase orders, newest first (A6).
// POST /api/orders — the agent's create_purchase_order. Body (snake or camel case):
//   { supplier, lines: [{ product, quantity }], reason }
// Every rule is checked here; the answer is "approved" (emailed to the supplier),
// "awaiting_approval" (over the limit, needs a human) or "rejected" with reasons.
import { connection } from "next/server";
import { z } from "zod";
import { listOrders } from "@/lib/data/fleet";
import { loadCatalog, parseBody } from "@/lib/data/agent-api";
import { createAgentOrder } from "@/lib/data/orders";

export async function GET() {
  await connection(); // live data: never prerender at build
  return Response.json(await listOrders());
}

const OrderBody = z
  .object({
    supplier: z.string().trim().min(1).max(100).optional(),
    supplier_id: z.string().trim().min(1).max(100).optional(),
    lines: z
      .array(z.object({ product: z.string().trim().min(1).max(100), quantity: z.number().int().min(1).max(1000) }))
      .min(1)
      .max(40),
    reason: z.string().trim().min(1).max(500),
  })
  .refine((b) => b.supplier || b.supplier_id, { message: "supplier (name or id) is required", path: ["supplier"] })
  .transform(({ supplier, supplier_id, ...rest }) => ({ ...rest, supplier: (supplier ?? supplier_id)! }));

export async function POST(req: Request) {
  const body = await parseBody(req, OrderBody);
  if ("error" in body) return body.error;
  const order = await createAgentOrder(body.data, await loadCatalog());
  return Response.json(order, { status: order.status === "rejected" ? 200 : 201 });
}
