// The simulated world, one day at a time: morning visits load stock, then the
// day's customers (generator.ts) buy what's there. Used by the seed (60 days
// under the fixed schedule), fast-forward (A7, the agent's plans) and the
// benchmark (A8, both strategies from the same starting point).
//
// Customers are a pure function of the day, so two worlds started from the same
// stock and given the same plans end up identical: that's what keeps A8 honest.

import type { ReaderSaleEvent } from "@/lib/sale-event";
import { sofiaTime, type Day } from "./calendar";
import { MACHINES, productById, slotsFor, type MachineDef } from "./fleet";
import { generateMachineDay } from "./generator";
import { consumeOne, restock, sellable, type Batch, type SlotStock } from "./stock";

export const VISIT_HOUR = 7; // stops start 07:30 Sofia time, before the morning rush
export const VISIT_MINUTE = 30;

/** What to load at one machine. `quantity: null` means "fill to capacity". */
export interface VisitPlan {
  machineId: string;
  routeOrder: number;
  loadList: { slotId: string; quantity: number | null; reason: string }[];
}

export interface SimVisit {
  machineId: string;
  day: Day;
  at: Date;
  routeOrder: number;
  loadList: { slotId: string; productId: string; productName: string; quantity: number; reason: string }[];
  wasted: number;
}

export interface SlotDayStats {
  slotId: string;
  day: Day;
  demand: number; // purchase attempts
  sold: number;
  lost: number; // attempts while the slot was empty
  wasted: number; // expired units pulled at a visit that day
}

export interface StockOutInterval {
  slotId: string;
  machineId: string;
  startedAt: Date;
  endedAt: Date | null; // null while still empty
}

export interface DayResult {
  day: Day;
  sales: ReaderSaleEvent[];
  visits: SimVisit[];
  slotDays: SlotDayStats[];
  lostRevenue: number;
  wastedCost: number;
}

export class SimWorld {
  readonly stock: SlotStock;
  /** slotId → when it became empty, for slots empty right now. */
  readonly openStockOuts: Map<string, Date>;
  /** Stock-outs that ended (were refilled) during this world's run. */
  readonly closedStockOuts: StockOutInterval[] = [];
  readonly machines: MachineDef[];

  constructor(opts: { stock: SlotStock; openStockOuts?: Map<string, Date>; machines?: MachineDef[] }) {
    this.stock = opts.stock;
    this.openStockOuts = opts.openStockOuts ?? new Map();
    this.machines = opts.machines ?? MACHINES;
  }

  /** A world where every slot was filled at 07:30 on `day`. */
  static full(day: Day, machines: MachineDef[] = MACHINES): SimWorld {
    const stock: SlotStock = new Map();
    const at = sofiaTime(day, VISIT_HOUR, VISIT_MINUTE);
    for (const m of machines) {
      for (const slot of slotsFor(m)) {
        const batches: Batch[] = [];
        restock(batches, { at, capacity: slot.capacity, shelfLifeDays: productById.get(slot.productId)!.shelfLifeDays });
        stock.set(slot.id, batches);
      }
    }
    return new SimWorld({ stock, machines });
  }

  /** Deep copy, so a second strategy can start from exactly the same state. */
  clone(): SimWorld {
    const stock: SlotStock = new Map(
      [...this.stock].map(([id, batches]) => [id, batches.map((b) => ({ ...b }))]),
    );
    return new SimWorld({ stock, openStockOuts: new Map(this.openStockOuts), machines: this.machines });
  }

  /** Stock-outs to store: everything that ended during the run, plus the ones still open. */
  stockOutIntervals(): StockOutInterval[] {
    const machineOf = (slotId: string) => slotId.slice(0, slotId.lastIndexOf("-"));
    return [
      ...this.closedStockOuts,
      ...[...this.openStockOuts].map(([slotId, startedAt]) => ({ slotId, machineId: machineOf(slotId), startedAt, endedAt: null })),
    ];
  }

  runDay(day: Day, plans: VisitPlan[]): DayResult {
    const result: DayResult = { day, sales: [], visits: [], slotDays: [], lostRevenue: 0, wastedCost: 0 };
    const planByMachine = new Map(plans.map((p) => [p.machineId, p]));

    for (const m of this.machines) {
      const slots = slotsFor(m);
      const stats = new Map(slots.map((s) => [s.id, { slotId: s.id, day, demand: 0, sold: 0, lost: 0, wasted: 0 }]));

      // Morning visit, if planned.
      const plan = planByMachine.get(m.id);
      if (plan) {
        const at = sofiaTime(day, VISIT_HOUR, VISIT_MINUTE + plan.routeOrder * 20); // ~20 min per stop
        const visit: SimVisit = { machineId: m.id, day, at, routeOrder: plan.routeOrder, loadList: [], wasted: 0 };
        for (const slot of slots) {
          const product = productById.get(slot.productId)!;
          const item = plan.loadList.find((l) => l.slotId === slot.id);
          const batches = this.stock.get(slot.id)!;
          // The stocker pulls expired items at every slot, loaded or not.
          const { wasted, loaded } = restock(batches, {
            at,
            capacity: slot.capacity,
            shelfLifeDays: product.shelfLifeDays,
            quantity: item ? (item.quantity ?? undefined) : 0,
          });
          stats.get(slot.id)!.wasted += wasted;
          visit.wasted += wasted;
          result.wastedCost += wasted * product.cost;
          if (sellable(batches, at) > 0) this.closeStockOut(slot.id, m.id, at);
          else if (wasted > 0) this.openStockOut(slot.id, at);
          if (loaded > 0) {
            visit.loadList.push({ slotId: slot.id, productId: product.id, productName: product.name, quantity: loaded, reason: item!.reason });
          }
        }
        result.visits.push(visit);
      }

      // Customers.
      for (const attempt of generateMachineDay(m, day)) {
        const slotId = `${m.id}-${attempt.ProductSelection}`;
        const at = new Date(attempt.AuthorizationDateTimeGMT);
        const batches = this.stock.get(slotId)!;
        const s = stats.get(slotId)!;
        s.demand++;
        if (consumeOne(batches, at)) {
          s.sold++;
          result.sales.push(attempt);
          if (sellable(batches, at) === 0) this.openStockOut(slotId, at); // that was the last one
        } else {
          s.lost++;
          result.lostRevenue += attempt.SettlementValue;
          this.openStockOut(slotId, at); // e.g. the last batch expired overnight
        }
      }
      result.slotDays.push(...stats.values());
    }
    return result;
  }

  private openStockOut(slotId: string, at: Date) {
    if (!this.openStockOuts.has(slotId)) this.openStockOuts.set(slotId, at);
  }

  private closeStockOut(slotId: string, machineId: string, at: Date) {
    const startedAt = this.openStockOuts.get(slotId);
    if (!startedAt) return;
    this.openStockOuts.delete(slotId);
    this.closedStockOuts.push({ slotId, machineId, startedAt, endedAt: at });
  }
}
