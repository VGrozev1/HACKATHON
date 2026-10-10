// Task A4: the stock model, backed by the StockLevel table (one row per batch).
//
// - A sale takes one unit from the oldest unexpired batch in its slot.
// - A stocker visit pulls expired units (waste) and adds a fresh batch.
// - A slot is "out of stock" when nothing sellable is left; emptySince says when
//   that happened (its last sale, or the moment its last batch expired).
//
// Bulk simulation (fast-forward) works on an in-memory copy (src/lib/sim/stock.ts)
// and writes it back with saveStock().

import { db } from "@/lib/db";
import type { LoadItem, SlotStock as SlotStockDto } from "@/lib/api-types";
import { sofiaTime } from "@/lib/sim/calendar";
import { restock, sellable, type Batch, type SlotStock } from "@/lib/sim/stock";
import { VISIT_HOUR, VISIT_MINUTE } from "@/lib/sim/world";

/** Batches per slot, oldest first. Pass machine ids to limit, or nothing for the fleet. */
export async function loadStock(machineIds?: string[]): Promise<SlotStock> {
  const rows = await db.stockLevel.findMany({
    where: machineIds ? { machineId: { in: machineIds } } : undefined,
    orderBy: { loadedAt: "asc" },
  });
  const stock: SlotStock = new Map();
  for (const r of rows) {
    const batches = stock.get(r.slotId) ?? [];
    batches.push({ quantity: r.quantity, expiresAt: r.expiresAt, loadedAt: r.loadedAt });
    stock.set(r.slotId, batches);
  }
  return stock;
}

/** Replace the stored batches of every slot in `stock` (other slots are untouched). */
export async function saveStock(stock: SlotStock): Promise<void> {
  const slotIds = [...stock.keys()];
  const slots = await db.slot.findMany({ where: { id: { in: slotIds } } });
  const bySlot = new Map(slots.map((s) => [s.id, s]));
  const rows = slotIds.flatMap((slotId) =>
    stock
      .get(slotId)!
      .filter((b) => b.quantity > 0)
      .map((b) => ({
        machineId: bySlot.get(slotId)!.machineId,
        slotId,
        productId: bySlot.get(slotId)!.productId,
        quantity: b.quantity,
        expiresAt: b.expiresAt,
        loadedAt: b.loadedAt,
      })),
  );
  await db.$transaction([
    db.stockLevel.deleteMany({ where: { slotId: { in: slotIds } } }),
    db.stockLevel.createMany({ data: rows }),
  ]);
}

/**
 * Record one real sale against stock (used by POST /api/ingest/sale).
 * A real reader only reports a vend that happened, so if our books say the slot
 * was empty we just leave stock at zero rather than reject the sale.
 */
export async function consumeStock(slotId: string, at: Date): Promise<void> {
  const batch = await db.stockLevel.findFirst({
    where: { slotId, quantity: { gt: 0 }, expiresAt: { gt: at } },
    orderBy: { loadedAt: "asc" },
  });
  if (batch) await db.stockLevel.update({ where: { id: batch.id }, data: { quantity: { decrement: 1 } } });
}

/** Per-slot stock of one machine at `at`, in the API shape. */
export async function machineSlotStock(machineId: string, at: Date): Promise<SlotStockDto[]> {
  const [slots, stock, lastSales] = await Promise.all([
    db.slot.findMany({ where: { machineId }, include: { product: true }, orderBy: { code: "asc" } }),
    loadStock([machineId]),
    db.saleEvent.groupBy({ by: ["slotId"], where: { machineId, occurredAt: { lte: at } }, _max: { occurredAt: true } }),
  ]);
  const lastSaleBySlot = new Map(lastSales.map((s) => [s.slotId, s._max.occurredAt]));
  return slots.map((slot) => {
    const batches = stock.get(slot.id) ?? [];
    const quantity = sellable(batches, at);
    const live = batches.filter((b) => b.quantity > 0 && b.expiresAt > at);
    return {
      slotId: slot.id,
      code: slot.code,
      productId: slot.productId,
      productName: slot.product.name,
      capacity: slot.capacity,
      quantity,
      nextExpiry: live.length ? new Date(Math.min(...live.map((b) => b.expiresAt.getTime()))).toISOString() : null,
      stockOut: quantity === 0,
      emptySince: quantity === 0 ? emptySince(batches, lastSaleBySlot.get(slot.id) ?? null, at) : null,
    };
  });
}

function emptySince(batches: Batch[], lastSale: Date | null, at: Date): string | null {
  const expired = batches.filter((b) => b.quantity > 0 && b.expiresAt <= at).map((b) => b.expiresAt.getTime());
  const candidates = [...expired, ...(lastSale ? [lastSale.getTime()] : [])];
  return candidates.length ? new Date(Math.max(...candidates)).toISOString() : null;
}

/** Fleet-level fill: units sellable now / total slot capacity, per machine (0–100). */
export async function stockPercentByMachine(at: Date): Promise<Map<string, number>> {
  const [slots, stock] = await Promise.all([db.slot.findMany(), loadStock()]);
  const totals = new Map<string, { units: number; capacity: number }>();
  for (const slot of slots) {
    const t = totals.get(slot.machineId) ?? { units: 0, capacity: 0 };
    t.units += sellable(stock.get(slot.id) ?? [], at);
    t.capacity += slot.capacity;
    totals.set(slot.machineId, t);
  }
  return new Map([...totals].map(([id, t]) => [id, Math.round((100 * t.units) / t.capacity)]));
}

/**
 * The stocker finished a stop: pull expired units, load the visit's load list,
 * mark it DONE. Shared by POST /api/visits/:id/done and the Telegram "done" button.
 * Time here is simulation time, so by default the stop happens at its scheduled
 * slot on the visit's day (07:30 + 20 min per stop), not at the real clock time.
 */
export async function completeVisit(visitId: string, at?: Date) {
  const visit = await db.visit.findUnique({ where: { id: visitId } });
  if (!visit) return null;
  if (visit.status === "DONE") return visit;
  at ??= sofiaTime(visit.date.toISOString().slice(0, 10), VISIT_HOUR, VISIT_MINUTE + visit.routeOrder * 20);

  const loadList = visit.loadList as unknown as LoadItem[];
  const slots = await db.slot.findMany({ where: { machineId: visit.machineId }, include: { product: true } });
  const stock = await loadStock([visit.machineId]);
  let wasted = 0;
  for (const slot of slots) {
    const item = loadList.find((l) => l.slotId === slot.id);
    const batches = stock.get(slot.id) ?? [];
    const result = restock(batches, {
      at,
      capacity: slot.capacity,
      shelfLifeDays: slot.product.shelfLifeDays,
      quantity: item?.quantity ?? 0,
    });
    wasted += result.wasted;
    stock.set(slot.id, batches);
  }
  await saveStock(stock);
  return db.visit.update({
    where: { id: visitId },
    data: { status: "DONE", doneAt: at, wastedUnits: wasted },
  });
}
