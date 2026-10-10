// Seeds the demo world (tasks A2 + A3): the fleet from src/lib/sim/fleet.ts and
// 60 days of history from the simulator, replayed under the fixed refill
// schedule so sales, visits, stock-outs and current stock all agree.
//
// Run with `npm run db:seed`. It WIPES every demo table first, so it's safe to
// rerun and always gives the same data (fixed seed). Dev database only.

import "dotenv/config";
import { db } from "../src/lib/db";
import { HISTORY_DAYS, SIM_TODAY, addDays } from "../src/lib/sim/calendar";
import { INVESTORS, MACHINES, PRODUCTS, SLOTS, SUPPLIERS, productById } from "../src/lib/sim/fleet";
import { simulateFixedSchedule } from "../src/lib/sim/history";
import { slotIdFor, toSaleEventRow } from "../src/lib/sale-event";

const CHUNK = 5000;

/** "team@gmail.com" + "drinks" → "team+drinks@gmail.com", so each supplier's mail is tagged. */
function supplierEmail(tag: string): string {
  const inbox = process.env.SUPPLIER_DEMO_EMAIL;
  if (!inbox?.includes("@")) return `${tag}@example.com`;
  const [user, domain] = inbox.split("@");
  return `${user}+${tag}@${domain}`;
}

async function wipe() {
  // Children before parents.
  await db.simState.deleteMany();
  await db.stockOut.deleteMany();
  await db.purchaseOrderLine.deleteMany();
  await db.purchaseOrder.deleteMany();
  await db.visit.deleteMany();
  await db.agentRun.deleteMany();
  await db.saleEvent.deleteMany();
  await db.stockLevel.deleteMany();
  await db.slot.deleteMany();
  await db.machine.deleteMany();
  await db.investor.deleteMany();
  await db.product.deleteMany();
  await db.supplier.deleteMany();
}

async function main() {
  const from = addDays(SIM_TODAY, -(HISTORY_DAYS - 1));
  console.log(`Seeding fleet and ${HISTORY_DAYS} days of history (${from} → ${SIM_TODAY})…`);

  await wipe();

  // ── A2: the fleet ──
  await db.supplier.createMany({
    data: SUPPLIERS.map((s) => ({
      id: s.id,
      name: s.name,
      email: supplierEmail(s.emailTag),
      minOrderValue: s.minOrderValue,
      leadTimeDays: s.leadTimeDays,
    })),
  });
  await db.product.createMany({
    data: PRODUCTS.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      cost: p.cost,
      price: p.price,
      shelfLifeDays: p.shelfLifeDays,
      supplierId: p.supplierId,
    })),
  });
  await db.investor.createMany({ data: INVESTORS });
  await db.machine.createMany({
    data: MACHINES.map((m) => ({
      id: m.id,
      name: m.name,
      locationType: m.locationType,
      address: m.address,
      lat: m.lat,
      lng: m.lng,
      investorId: m.investorId ?? null,
    })),
  });
  await db.slot.createMany({ data: SLOTS });
  console.log(`  ${SUPPLIERS.length} suppliers, ${PRODUCTS.length} products, ${MACHINES.length} machines, ${SLOTS.length} slots`);

  // ── A3: history ──
  const { world, days } = simulateFixedSchedule({ from, to: SIM_TODAY });
  const slotById = new Map(SLOTS.map((s) => [s.id, s]));

  const saleRows = days.flatMap((d) =>
    d.sales.map((e) => toSaleEventRow(e, slotById.get(slotIdFor(e.MachineId, e.ProductSelection))!)),
  );
  for (let i = 0; i < saleRows.length; i += CHUNK) {
    await db.saleEvent.createMany({ data: saleRows.slice(i, i + CHUNK) });
    process.stdout.write(`\r  sales ${Math.min(i + CHUNK, saleRows.length)}/${saleRows.length}`);
  }
  console.log();

  const visits = days.flatMap((d) => d.visits);
  await db.visit.createMany({
    data: visits.map((v) => ({
      date: new Date(`${v.day}T00:00:00Z`),
      routeOrder: v.routeOrder,
      machineId: v.machineId,
      status: "DONE" as const,
      loadList: v.loadList,
      doneAt: v.at,
      wastedUnits: v.wasted,
    })),
  });

  const stockRows = [...world.stock.entries()].flatMap(([slotId, batches]) => {
    const slot = slotById.get(slotId)!;
    return batches
      .filter((b) => b.quantity > 0)
      .map((b) => ({
        machineId: slot.machineId,
        slotId,
        productId: slot.productId,
        quantity: b.quantity,
        expiresAt: b.expiresAt,
        loadedAt: b.loadedAt,
      }));
  });
  await db.stockLevel.createMany({ data: stockRows });

  const stockOuts = world.stockOutIntervals();
  await db.stockOut.createMany({ data: stockOuts });
  await db.simState.create({ data: { id: "singleton", today: SIM_TODAY } });

  const slotDays = days.flatMap((d) => d.slotDays);
  const lost = slotDays.reduce((n, s) => n + s.lost, 0);
  const wasted = slotDays.reduce((n, s) => n + s.wasted, 0);
  console.log(`  ${visits.length} visits, ${stockRows.length} stock batches, ${stockOuts.length} stock-outs`);
  console.log(`  fixed schedule: ${lost} purchases lost to stock-outs, ${wasted} units wasted`);
  console.log(`Done. Sim clock set to ${SIM_TODAY}. Products in use: ${new Set(SLOTS.map((s) => s.productId)).size}/${productById.size}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
