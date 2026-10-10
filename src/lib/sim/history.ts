// Replays a stretch of days the "old way": the stocker visits each machine on
// fixed weekdays and fills every slot to the top, whatever the forecast says.
// The seed uses it to build 60 days of history in which sales, stock-outs,
// waste and the current stock all add up. The same policy is the "fixed weekly
// order" baseline the agent is compared against in the benchmark (A8).

import type { ReaderSaleEvent } from "@/lib/sale-event";
import { dayOfWeek, dayRange, addDays, sofiaTime, type Day } from "./calendar";
import { MACHINES, productById, slotsFor, type MachineDef } from "./fleet";
import { generateMachineDay } from "./generator";
import { consumeOne, restock, type Batch, type SlotStock } from "./stock";

/** Fixed refill weekdays (0 = Sunday). Twice a week for most; hospitals three times. */
export const FIXED_VISIT_DAYS: Record<MachineDef["locationType"], number[]> = {
  GYM: [1, 4], // Mon, Thu
  OFFICE: [1, 4], // Mon, Thu
  HOSPITAL: [1, 3, 5], // Mon, Wed, Fri
  UNIVERSITY: [2, 5], // Tue, Fri
  OTHER: [1],
};

export const VISIT_HOUR = 7; // 07:30 Sofia time, before the morning rush
const VISIT_MINUTE = 30;

export interface SimVisit {
  machineId: string;
  day: Day;
  at: Date;
  loadList: { slotId: string; productId: string; productName: string; quantity: number; reason: string }[];
  wasted: number;
}

export interface SlotDayStats {
  slotId: string;
  day: Day;
  demand: number; // purchase attempts
  sold: number;
  lost: number; // attempts while the slot was empty: the stock-out signal
  wasted: number; // expired units pulled at a visit that day
}

export interface HistoryResult {
  sales: ReaderSaleEvent[];
  visits: SimVisit[];
  stock: SlotStock; // state at the end of the last day
  slotDays: SlotDayStats[];
}

export function simulateFixedSchedule(opts: {
  from: Day;
  to: Day;
  machines?: MachineDef[];
}): HistoryResult {
  const machines = opts.machines ?? MACHINES;
  const stock: SlotStock = new Map();
  const sales: ReaderSaleEvent[] = [];
  const visits: SimVisit[] = [];
  const slotDays: SlotDayStats[] = [];

  // Start full: everything was loaded at 07:30 the day before the window.
  const startAt = sofiaTime(addDays(opts.from, -1), VISIT_HOUR, VISIT_MINUTE);
  for (const m of machines) {
    for (const slot of slotsFor(m)) {
      const batches: Batch[] = [];
      restock(batches, { at: startAt, capacity: slot.capacity, shelfLifeDays: productById.get(slot.productId)!.shelfLifeDays });
      stock.set(slot.id, batches);
    }
  }

  for (const day of dayRange(opts.from, opts.to)) {
    for (const m of machines) {
      const slots = slotsFor(m);
      const stats = new Map(slots.map((s) => [s.id, { slotId: s.id, day, demand: 0, sold: 0, lost: 0, wasted: 0 }]));

      // Morning visit on fixed weekdays: top every slot up to capacity.
      if (FIXED_VISIT_DAYS[m.locationType].includes(dayOfWeek(day))) {
        const at = sofiaTime(day, VISIT_HOUR, VISIT_MINUTE);
        const visit: SimVisit = { machineId: m.id, day, at, loadList: [], wasted: 0 };
        for (const slot of slots) {
          const product = productById.get(slot.productId)!;
          const { wasted, loaded } = restock(stock.get(slot.id)!, {
            at,
            capacity: slot.capacity,
            shelfLifeDays: product.shelfLifeDays,
          });
          stats.get(slot.id)!.wasted += wasted;
          visit.wasted += wasted;
          if (loaded > 0) {
            visit.loadList.push({
              slotId: slot.id,
              productId: product.id,
              productName: product.name,
              quantity: loaded,
              reason: wasted > 0 ? `Fill to capacity; pulled ${wasted} expired` : "Fill to capacity (fixed schedule)",
            });
          }
        }
        visits.push(visit);
      }

      // Customers: each attempt succeeds only if the slot has unexpired stock.
      for (const attempt of generateMachineDay(m, day)) {
        const slotId = `${m.id}-${attempt.ProductSelection}`;
        const s = stats.get(slotId)!;
        s.demand++;
        if (consumeOne(stock.get(slotId)!, new Date(attempt.AuthorizationDateTimeGMT))) {
          s.sold++;
          sales.push(attempt);
        } else {
          s.lost++;
        }
      }

      slotDays.push(...stats.values());
    }
  }

  return { sales, visits, stock, slotDays };
}
