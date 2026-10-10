// The night planner interface used by fast-forward (A7) and the benchmark (A8),
// plus a simple rule-based planner that stands in until Viktor's LLM agent (B1–B5)
// is ready. To plug the agent in, implement NightPlanner and pass it to
// fastForward() — nothing else changes.
//
// The stand-in sees only what the real agent would: current stock, the A5
// forecast, the weather forecast, holidays (calendar.ts) and the operator's
// usual visit schedule. It never sees the simulator's true demand. Each day it
// gets the same number of stops as the fixed schedule, so the comparison is
// about *which* machines and *how much*, not about working harder.

import { addDays, dayOfWeek, holidayOn, sofiaTime, weatherOn, type Day } from "./calendar";
import { productById, slotsFor, type Category, type MachineDef } from "./fleet";
import { FIXED_VISIT_DAYS } from "./history";
import { sellable, type SlotStock } from "./stock";
import { VISIT_HOUR, VISIT_MINUTE, type VisitPlan } from "./world";

/** slotId → expected units per weekday (index 0 = Sunday), from the A5 baseline. */
export type BaselineLike = Map<string, number[]>;

export interface NightContext {
  /** The day being planned (visits happen that morning). */
  day: Day;
  machines: MachineDef[];
  stock: SlotStock;
  baseline: BaselineLike;
  /** Max stocker visits for the day (see visitAllowance in benchmark.ts). */
  visitBudget: number;
}

export interface ForecastAdjustment {
  slotId: string;
  baseline: number;
  adjusted: number;
  reason: string;
}

export interface NightPlan {
  visits: VisitPlan[];
  adjustments: ForecastAdjustment[];
  /** One plain-language line per decision, for AgentRun.decisions. */
  decisions: { kind: "visit" | "forecast_adjustment"; machineId?: string; summary: string; reason: string }[];
  explanation: string;
}

export interface NightPlanner {
  name: string;
  plan(ctx: NightContext): Promise<NightPlan> | NightPlan;
}

// ─── Stand-in rules ──────────────────────────────────────────────────────────

const DEPOT = { lat: 42.6977, lng: 23.3219 }; // warehouse near the centre
const COVER_DAYS = 3; // fresh food: load enough for this many days at most
const DURABLE_SHELF_LIFE = 30; // longer than this can't go off before it sells: fill to the top
const FRESH_SAFETY = 1.4; // fresh food: the next stop may be days away

/** Weather/holiday adjustment the agent would make (B4-style), with a reason. */
export function contextFactor(category: Category, machine: MachineDef, day: Day): { factor: number; reason: string | null } {
  const holiday = holidayOn(day);
  if (holiday && (machine.locationType === "OFFICE" || machine.locationType === "UNIVERSITY")) {
    return { factor: 0.1, reason: `${holiday}: ${machine.locationType.toLowerCase()} closed` };
  }
  const w = weatherOn(day);
  if (category === "drink") {
    const f = Math.min(1.5, Math.max(0.75, 1 + 0.03 * (w.tMaxC - 22))) * (w.rainy ? 0.9 : 1);
    if (Math.abs(f - 1) >= 0.1) return { factor: f, reason: `${w.tMaxC} °C${w.rainy ? ", rain" : ""}: cold drinks ${f > 1 ? "+" : ""}${Math.round((f - 1) * 100)}%` };
    return { factor: f, reason: null };
  }
  return { factor: 1, reason: null };
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dx = (a.lng - b.lng) * 111 * Math.cos((a.lat * Math.PI) / 180);
  const dy = (a.lat - b.lat) * 111;
  return Math.hypot(dx, dy);
}

/** Nearest-neighbour route from the depot (B3 does it properly; this is enough). */
export function routeOrder(machines: MachineDef[]): MachineDef[] {
  const left = [...machines];
  const route: MachineDef[] = [];
  let here = DEPOT;
  while (left.length) {
    left.sort((a, b) => distanceKm(here, a) - distanceKm(here, b));
    const next = left.shift()!;
    route.push(next);
    here = next;
  }
  return route;
}

const HORIZON_DAYS = 7; // how far ahead stock is projected
const RUN_OUT_SHARE = 0.1; // "running out" = missing more than 10% of the day's demand (min 2 sales)

/** Days from `day` until the operator's schedule would next bring a stop to this machine (1–7). */
function daysToNextScheduledVisit(machine: MachineDef, day: Day): number {
  for (let i = 1; i <= 7; i++) {
    if (FIXED_VISIT_DAYS[machine.locationType].includes(dayOfWeek(addDays(day, i)))) return i;
  }
  return 7;
}

/**
 * Start from the operator's usual schedule and fix its blind spots. A stop now
 * goes to the machines that would otherwise miss the most sales before their
 * next scheduled stop. Scheduled machines with enough stock to last are
 * skipped, and their stops go to machines that would run dry first. Loads:
 * durable goods to the top, fresh food to what sells before it expires, with
 * weather and holidays in the forecast. (Picking greedily day by day without
 * the schedule's rhythm was tried and lost: machines went too long unvisited.)
 */
export const ruleBasedPlanner: NightPlanner = {
  name: "rule-based stand-in",
  plan({ day, machines, stock, baseline, visitBudget }) {
    const at = sofiaTime(day, VISIT_HOUR, VISIT_MINUTE);
    const adjustments: ForecastAdjustment[] = [];
    const candidates: { machine: MachineDef; urgency: number; runOut: number; scheduled: boolean; loadList: VisitPlan["loadList"] }[] = [];
    const spare: { machine: MachineDef; urgency: number; runOut: number; scheduled: boolean; loadList: VisitPlan["loadList"] }[] = [];

    for (const m of machines) {
      const loadList: VisitPlan["loadList"] = [];
      const missedByDay = Array(HORIZON_DAYS).fill(0);
      const demandByDay = Array(HORIZON_DAYS).fill(0);

      for (const slot of slotsFor(m)) {
        const product = productById.get(slot.productId)!;
        const batches = stock.get(slot.id) ?? [];
        const perDow = baseline.get(slot.id) ?? [0, 0, 0, 0, 0, 0, 0];

        // Expected demand per day ahead, adjusted for weather and holidays (B4-style).
        const daily = Array.from({ length: HORIZON_DAYS }, (_, i) => {
          const d = addDays(day, i);
          const base = perDow[dayOfWeek(d)];
          const { factor, reason } = contextFactor(product.category, m, d);
          if (i === 0 && reason && base >= 1) {
            adjustments.push({ slotId: slot.id, baseline: base, adjusted: base * factor, reason });
          }
          return base * factor;
        });

        // Project the slot without a visit: oldest batches first, expired ones gone.
        const left = batches.map((b) => ({ qty: b.quantity, expires: b.expiresAt.getTime() }));
        daily.forEach((want, i) => {
          const midday = sofiaTime(addDays(day, i), 12).getTime();
          let need = want;
          for (const b of left) {
            if (b.expires <= midday || need <= 0) continue;
            const take = Math.min(b.qty, need);
            b.qty -= take;
            need -= take;
          }
          missedByDay[i] += need;
          demandByDay[i] += want;
        });

        // What to load if we do visit.
        const onHand = sellable(batches, at);
        const goodFor = (b: (typeof batches)[number]) => Math.floor((b.expiresAt.getTime() - at.getTime()) / 86400000);
        const durable = product.shelfLifeDays > DURABLE_SHELF_LIFE;
        const coverDays = Math.min(COVER_DAYS, product.shelfLifeDays);
        const usable = batches.reduce((n, b) => {
          if (b.expiresAt <= at) return n;
          if (goodFor(b) >= coverDays) return n + b.quantity;
          return n + Math.min(b.quantity, Math.ceil(daily.slice(0, Math.max(0, goodFor(b))).reduce((x, y) => x + y, 0)));
        }, 0);
        const need = daily.slice(0, coverDays).reduce((x, y) => x + y, 0);
        const target = durable ? slot.capacity : Math.min(slot.capacity, Math.ceil(need * FRESH_SAFETY));
        const load = Math.max(0, target - usable);
        if (load >= 2) {
          const why = onHand === 0 ? "empty" : usable < onHand ? `${onHand - usable} expiring` : `${onHand} left`;
          loadList.push({
            slotId: slot.id,
            quantity: load,
            reason: durable ? `${why}; fill (~${Math.round(need)} expected in ${coverDays} d)` : `${why}; ~${Math.round(need)} expected before it expires`,
          });
        }
      }
      if (!loadList.length) continue;

      // Sales this machine would miss if it waits for its next scheduled stop.
      const gap = daysToNextScheduledVisit(m, day);
      const urgency = missedByDay.slice(0, gap).reduce((a, b) => a + b, 0);
      const runOut = missedByDay.findIndex((missed, i) => missed > Math.max(2, RUN_OUT_SHARE * demandByDay[i]));
      const scheduled = FIXED_VISIT_DAYS[m.locationType].includes(dayOfWeek(day));
      if (runOut !== -1 && runOut < gap) {
        candidates.push({ machine: m, urgency, runOut, scheduled, loadList });
      } else {
        // Lasts until its next scheduled stop. Still worth a stop if one is spare:
        // rank by sales it would miss over the coming week.
        const weekMissed = missedByDay.reduce((a, b) => a + b, 0);
        if (weekMissed >= 2) spare.push({ machine: m, urgency: weekMissed, runOut, scheduled, loadList });
      }
    }

    const urgent = candidates.sort((a, b) => b.urgency - a.urgency).slice(0, visitBudget);
    const chosen = [...urgent, ...spare.sort((a, b) => b.urgency - a.urgency).slice(0, visitBudget - urgent.length)];
    // Emptiest first: on a long route the last stop is restocked hours later, so
    // machines already losing sales go first; the rest follow the shortest path.
    const losingNow = chosen.filter((c) => c.runOut === 0).sort((a, b) => b.urgency - a.urgency).map((c) => c.machine);
    const route = [...losingNow, ...routeOrder(chosen.filter((c) => c.runOut !== 0).map((c) => c.machine))];
    const visits: VisitPlan[] = route.map((m, i) => ({
      machineId: m.id,
      routeOrder: i + 1,
      loadList: chosen.find((c) => c.machine.id === m.id)!.loadList,
    }));

    const decisions: NightPlan["decisions"] = [
      ...chosen.map((c) => ({
        kind: "visit" as const,
        machineId: c.machine.id,
        summary: `Visit ${c.machine.name}: load ${c.loadList.reduce((n, l) => n + (l.quantity ?? 0), 0)} units in ${c.loadList.length} slots`,
        reason: urgent.includes(c)
          ? `${c.scheduled ? "Scheduled today" : "Not scheduled today"}; would miss ~${Math.round(c.urgency)} sales before its next scheduled stop`
          : `Spare stop: top up before ~${Math.round(c.urgency)} sales go missing this week`,
      })),
      ...adjustments.slice(0, 5).map((a) => ({
        kind: "forecast_adjustment" as const,
        summary: `${a.slotId}: ${a.baseline.toFixed(1)} → ${a.adjusted.toFixed(1)} units`,
        reason: a.reason,
      })),
    ];
    const w = weatherOn(day);
    const scheduledToday = machines.filter((m) => FIXED_VISIT_DAYS[m.locationType].includes(dayOfWeek(day)));
    const skipped = scheduledToday.filter((m) => !chosen.some((c) => c.machine.id === m.id)).length;
    const added = chosen.filter((c) => !c.scheduled).length;
    const explanation =
      `${visits.length} stops for ${day} (${w.tMaxC} °C${holidayOn(day) ? `, ${holidayOn(day)}` : ""}). ` +
      (skipped ? `Skipped ${skipped} scheduled machines with enough stock. ` : "") +
      (added ? `Added ${added} unscheduled machines that would run out first. ` : "") +
      (adjustments.length ? `Adjusted ${adjustments.length} slot forecasts for weather/holidays.` : "");
    return { visits, adjustments, decisions, explanation };
  },
};
