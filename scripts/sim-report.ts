// Dry run of the 60-day history, no database: prints whether the numbers look
// believable. Run after tweaking demand or the fleet: `npm run sim:report`.

import { HISTORY_DAYS, SIM_TODAY, addDays, dayOfWeek, holidayOn, weatherOn } from "../src/lib/sim/calendar";
import { MACHINES, productById, SLOTS } from "../src/lib/sim/fleet";
import { simulateFixedSchedule } from "../src/lib/sim/history";
import { sellable } from "../src/lib/sim/stock";

const from = addDays(SIM_TODAY, -(HISTORY_DAYS - 1));
const t0 = Date.now();
const h = simulateFixedSchedule({ from, to: SIM_TODAY });
const ms = Date.now() - t0;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const pct = (a: number, b: number) => `${((100 * a) / b).toFixed(1)}%`;

const demand = sum(h.slotDays.map((s) => s.demand));
const sold = sum(h.slotDays.map((s) => s.sold));
const lost = sum(h.slotDays.map((s) => s.lost));
const wasted = sum(h.slotDays.map((s) => s.wasted));
const revenue = sum(h.sales.map((s) => s.SettlementValue));

console.log(`History ${from} → ${SIM_TODAY} (${HISTORY_DAYS} days), simulated in ${ms} ms`);
console.log(`Sales rows: ${h.sales.length}  revenue €${revenue.toFixed(0)}  visits: ${h.visits.length}`);
console.log(`Demand ${demand}  sold ${sold}  lost to stock-outs ${lost} (${pct(lost, demand)})  wasted ${wasted}`);

console.log("\nPer machine (avg units sold/day, lost %, wasted):");
for (const m of MACHINES) {
  const rows = h.slotDays.filter((s) => s.slotId.startsWith(`${m.id}-`));
  const d = sum(rows.map((r) => r.demand));
  console.log(
    `  ${m.id.padEnd(11)} ${m.locationType.padEnd(10)} ${(sum(rows.map((r) => r.sold)) / HISTORY_DAYS).toFixed(1).padStart(5)}/day  lost ${pct(sum(rows.map((r) => r.lost)), d).padStart(6)}  wasted ${sum(rows.map((r) => r.wasted))}`,
  );
}

console.log("\nTop products by units sold:");
const byProduct = new Map<string, number>();
for (const s of h.sales) {
  const slot = SLOTS.find((x) => x.machineId === s.MachineId && x.code === s.ProductSelection)!;
  byProduct.set(slot.productId, (byProduct.get(slot.productId) ?? 0) + 1);
}
[...byProduct.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 8)
  .forEach(([id, n]) => console.log(`  ${productById.get(id)!.name.padEnd(30)} ${n}`));

console.log("\nFleet units sold per day (last 14 days):");
for (let i = 13; i >= 0; i--) {
  const day = addDays(SIM_TODAY, -i);
  const n = sum(h.slotDays.filter((s) => s.day === day).map((s) => s.sold));
  const w = weatherOn(day);
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dayOfWeek(day)];
  console.log(`  ${day} ${dow} ${String(n).padStart(5)}  ${w.tMaxC}°C${w.rainy ? " rain" : ""}${holidayOn(day) ? `  [${holidayOn(day)}]` : ""}`);
}

const end = new Date(`${SIM_TODAY}T23:59:59Z`);
const empty = SLOTS.filter((s) => sellable(h.stock.get(s.id)!, end) === 0).length;
console.log(`\nEnd state: ${empty}/${SLOTS.length} slots empty tonight`);
