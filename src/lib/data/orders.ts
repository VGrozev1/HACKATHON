// Purchase orders placed by the agent (POST /api/orders) and the supplier email.
// Every rule is checked here, on the server, against the real catalog: the
// agent's own guardrails are a helpful first pass, this is the final word.
// Approved orders are recorded, not emailed: the nightly email covers them.

import { db } from "@/lib/db";
import { addDays, sofiaTime } from "@/lib/sim/calendar";
import { nextReadableId, type Catalog } from "./agent-api";
import { getSimToday } from "./sim-clock";

export const autoApproveLimit = () => Number(process.env.AUTO_APPROVE_LIMIT_EUR ?? 300);
const SELL_THROUGH_WEEKS = 4;

export interface AgentOrderInput {
  supplier: string;
  lines: { product: string; quantity: number }[];
  reason: string;
}

/** The order as the agent's create_purchase_order tool returns it. */
export interface AgentOrderResult {
  id: string;
  supplier: string;
  lines: { product: string; quantity: number }[];
  reason: string;
  createdAt: string;
  status: "approved" | "awaiting_approval" | "rejected";
  totalEur: number;
  reasons: string[];
  emailed: boolean;
  delivery_date: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Units per day the whole fleet sold of each product over the last 4 weeks. */
async function fleetDailySales(today: string): Promise<Map<string, number>> {
  const rows = await db.saleEvent.groupBy({
    by: ["productId"],
    where: { occurredAt: { gte: sofiaTime(addDays(today, -(SELL_THROUGH_WEEKS * 7 - 1)), 0), lt: sofiaTime(addDays(today, 1), 0) } },
    _count: true,
  });
  return new Map(rows.map((r) => [r.productId, r._count / (SELL_THROUGH_WEEKS * 7)]));
}

export async function createAgentOrder(input: AgentOrderInput, catalog: Catalog): Promise<AgentOrderResult> {
  const today = await getSimToday();
  const reasons: string[] = [];
  const supplier = catalog.findSupplier(input.supplier);
  if (!supplier) {
    reasons.push(`"${input.supplier}" is not one of our suppliers. Suppliers: ${catalog.suppliers.map((s) => s.name).join(", ")}.`);
  } else if (!supplier.approved) {
    reasons.push(`"${supplier.name}" is not an approved supplier.`);
  }

  const [daily, warehouse] = await Promise.all([fleetDailySales(today), db.warehouseStock.findMany()]);
  const inWarehouse = new Map(warehouse.map((w) => [w.productId, w.quantity]));
  const resolved: { productId: string; name: string; quantity: number; unitCost: number }[] = [];
  let total = 0;

  for (const line of input.lines) {
    const product = catalog.findProduct(line.product);
    if (!product) {
      reasons.push(`"${line.product}" is not a product we carry.`);
      continue;
    }
    if (supplier && product.supplierId !== supplier.id) {
      reasons.push(`${product.name} comes from ${product.supplier.name}, not ${supplier.name}.`);
      continue;
    }
    const perDay = daily.get(product.id) ?? 0;
    const daysToSell = perDay > 0 ? line.quantity / perDay : Infinity;
    if (daysToSell >= product.shelfLifeDays) {
      reasons.push(
        `${line.quantity} × ${product.name} would take ${Number.isFinite(daysToSell) ? daysToSell.toFixed(1) : "forever"} days to sell (fleet sells ${perDay.toFixed(1)}/day) but keeps only ${product.shelfLifeDays} days.`,
      );
    }
    const have = inWarehouse.get(product.id) ?? 0;
    if (have + line.quantity > product.warehouseCapacity) {
      reasons.push(`The warehouse has room for ${Math.max(0, product.warehouseCapacity - have)} more ${product.name}, not ${line.quantity}.`);
    }
    total += line.quantity * product.cost;
    resolved.push({ productId: product.id, name: product.name, quantity: line.quantity, unitCost: product.cost });
  }
  total = round2(total);
  if (supplier && reasons.length === 0 && total < supplier.minOrderValue) {
    reasons.push(`Total €${total.toFixed(2)} is below ${supplier.name}'s minimum order of €${supplier.minOrderValue}.`);
  }

  const status = reasons.length ? "rejected" : total > autoApproveLimit() ? "awaiting_approval" : "approved";
  const existing = await db.purchaseOrder.findMany({ where: { id: { startsWith: "PO-" } }, select: { id: true } });
  const id = nextReadableId("PO", existing.map((o) => o.id));
  const deliveryDate = addDays(today, 1 + (supplier?.leadTimeDays ?? 1));

  // A rejected order needs a supplier row to be stored; with an unknown
  // supplier it is only returned (with its reasons), never saved.
  if (supplier) {
    await db.purchaseOrder.create({
      data: {
        id,
        supplierId: supplier.id,
        status: status === "rejected" ? "REJECTED" : status === "awaiting_approval" ? "AWAITING_APPROVAL" : "APPROVED",
        total,
        deliveryDate: new Date(`${deliveryDate}T00:00:00Z`),
        explanation: input.reason,
        rejectionReasons: reasons,
        lines: { create: resolved.map(({ productId, quantity, unitCost }) => ({ productId, quantity, unitCost })) },
      },
    });
  }

  // Orders are not emailed one by one: after the night's run, one email lists
  // everything missing from the machines (src/lib/data/night-notify.ts).
  const emailed = false;
  return {
    id,
    supplier: supplier?.name ?? input.supplier,
    lines: resolved.length ? resolved.map((l) => ({ product: l.name, quantity: l.quantity })) : input.lines,
    reason: input.reason,
    createdAt: new Date().toISOString(),
    status,
    totalEur: total,
    reasons,
    emailed,
    delivery_date: deliveryDate,
  };
}
