// Tomorrow's stocker route from the agent (POST /api/visits) and the "Done"
// button addressed by machine (done:<machineId> in Telegram).

import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { LoadItem } from "@/lib/api-types";
import { addDays } from "@/lib/sim/calendar";
import type { Catalog } from "./agent-api";
import { getSimToday } from "./sim-clock";
import { completeVisit } from "./stock";

export interface PlanInput {
  route: string[];
  load_lists: { machine_id: string; items: { product: string; quantity: number }[] }[];
  date?: string;
}

/**
 * Save the route as PLANNED visits. The agent names products, not slots, so
 * each line is spread over the machine's slots holding that product, filling
 * them in slot order up to capacity. Re-planning the same day replaces that
 * day's open visits. Returns an error message instead when the plan is invalid.
 */
export async function planVisits(input: PlanInput, catalog: Catalog) {
  const date = input.date ?? addDays(await getSimToday(), 1);
  const ids = [...new Set([...input.route, ...input.load_lists.map((l) => l.machine_id)])];
  const machines = await db.machine.findMany({ where: { id: { in: ids } }, include: { slots: { orderBy: { code: "asc" } } } });
  const unknown = ids.filter((id) => !machines.some((m) => m.id === id));
  if (unknown.length) return { error: `Unknown machine ids: ${unknown.join(", ")}` };
  const missing = input.load_lists.filter((l) => !input.route.includes(l.machine_id)).map((l) => l.machine_id);
  if (missing.length) return { error: `Load lists for machines not on the route: ${missing.join(", ")}` };

  const plans: { machineId: string; routeOrder: number; loadList: LoadItem[] }[] = [];
  for (const [i, machineId] of input.route.entries()) {
    const machine = machines.find((m) => m.id === machineId)!;
    const loadList: LoadItem[] = [];
    for (const item of input.load_lists.find((l) => l.machine_id === machineId)?.items ?? []) {
      const product = catalog.findProduct(item.product);
      if (!product) return { error: `"${item.product}" is not a product we carry` };
      const slots = machine.slots.filter((s) => s.productId === product.id);
      if (!slots.length) return { error: `${machine.name} has no slot for ${product.name}` };
      const totalCapacity = slots.reduce((n, s) => n + s.capacity, 0);
      if (item.quantity > totalCapacity) {
        return { error: `${item.quantity} × ${product.name} is more than ${machine.name}'s ${totalCapacity} slot capacity for it` };
      }
      let left = item.quantity;
      for (const slot of slots) {
        const qty = Math.min(left, slot.capacity);
        if (qty > 0) loadList.push({ slotId: slot.id, productId: product.id, productName: product.name, quantity: qty, reason: "Planned by the agent" });
        left -= qty;
      }
    }
    plans.push({ machineId, routeOrder: i + 1, loadList });
  }

  const day = new Date(`${date}T00:00:00Z`);
  await db.$transaction([
    db.visit.deleteMany({ where: { date: day, status: { in: ["PLANNED", "SENT"] } } }),
    db.visit.createMany({ data: plans.map((p) => ({ ...p, loadList: p.loadList as unknown as Prisma.InputJsonArray, date: day, status: "PLANNED" as const })) }),
  ]);
  const saved = await db.visit.findMany({ where: { date: day, status: "PLANNED" }, orderBy: { routeOrder: "asc" } });
  return {
    date,
    visits: saved.map((v) => ({ id: v.id, machine_id: v.machineId, route_order: v.routeOrder, items: (v.loadList as unknown as LoadItem[]).length })),
  };
}

/** "Done" for a machine: completes its next open visit (loads stock, takes it from the warehouse). */
export async function completeNextVisit(machineId: string) {
  const visit = await db.visit.findFirst({
    where: { machineId, status: { in: ["PLANNED", "SENT"] } },
    orderBy: [{ date: "asc" }, { routeOrder: "asc" }],
  });
  if (!visit) return null;
  return completeVisit(visit.id);
}
