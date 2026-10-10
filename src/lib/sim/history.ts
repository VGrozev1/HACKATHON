// The "old way": the stocker visits each machine on fixed weekdays and fills
// every slot to the top, whatever the forecast says. The seed replays 60 days
// of history with it, and it is the "fixed weekly order" baseline the agent is
// compared against in the benchmark (A8).

import { addDays, dayOfWeek, dayRange, type Day } from "./calendar";
import { MACHINES, slotsFor, type MachineDef } from "./fleet";
import { SimWorld, type DayResult, type VisitPlan } from "./world";

/** Fixed refill weekdays (0 = Sunday). Twice a week for most; hospitals three times. */
export const FIXED_VISIT_DAYS: Record<MachineDef["locationType"], number[]> = {
  GYM: [1, 4], // Mon, Thu
  OFFICE: [1, 4], // Mon, Thu
  HOSPITAL: [1, 3, 5], // Mon, Wed, Fri
  UNIVERSITY: [2, 5], // Tue, Fri
  OTHER: [1],
};

/** The fixed schedule's visits for one day: every due machine, every slot filled to the top. */
export function fixedSchedulePlans(day: Day, machines: MachineDef[] = MACHINES): VisitPlan[] {
  return machines
    .filter((m) => FIXED_VISIT_DAYS[m.locationType].includes(dayOfWeek(day)))
    .map((m, i) => ({
      machineId: m.id,
      routeOrder: i + 1,
      loadList: slotsFor(m).map((s) => ({ slotId: s.id, quantity: null, reason: "Fill to capacity (fixed schedule)" })),
    }));
}

export interface HistoryResult {
  world: SimWorld;
  days: DayResult[];
}

/** Replay `from`..`to` under the fixed schedule, starting with every slot full. */
export function simulateFixedSchedule(opts: { from: Day; to: Day; machines?: MachineDef[] }): HistoryResult {
  const world = SimWorld.full(addDays(opts.from, -1), opts.machines);
  const days = dayRange(opts.from, opts.to).map((day) => world.runDay(day, fixedSchedulePlans(day, world.machines)));
  return { world, days };
}
