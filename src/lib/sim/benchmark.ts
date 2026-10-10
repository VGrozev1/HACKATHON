// Task A8: agent vs fixed weekly order, the "one number" for the judges.
//
// Fairness, by construction:
// - both strategies start from an identical copy of the world (same stock),
// - both face the same customers (demand is a pure function of the day),
// - both get the same number of stocker stops each day.
// The only difference is which machines get the stops, in what order, and what
// gets loaded.

import type { Benchmark, StrategyResult } from "@/lib/api-types";
import { addDays, dayRange, type Day } from "./calendar";
import { fixedSchedulePlans } from "./history";
import type { BaselineLike, NightPlan, NightPlanner } from "./planner";
import type { DayResult, SimWorld } from "./world";

const round2 = (n: number) => Math.round(n * 100) / 100;

export function strategyResult(days: DayResult[]): StrategyResult {
  const slotDays = days.flatMap((d) => d.slotDays);
  return {
    stockOuts: slotDays.reduce((n, s) => n + s.lost, 0),
    expiredUnits: slotDays.reduce((n, s) => n + s.wasted, 0),
    visits: days.reduce((n, d) => n + d.visits.length, 0),
    lostRevenue: round2(days.reduce((n, d) => n + d.lostRevenue, 0)),
    wastedCost: round2(days.reduce((n, d) => n + d.wastedCost, 0)),
  };
}

export function toBenchmark(from: Day, agentDays: DayResult[], fixedDays: DayResult[]): Benchmark {
  const lost = (d: DayResult) => d.slotDays.reduce((n, s) => n + s.lost, 0);
  return {
    from,
    until: agentDays.at(-1)?.day ?? from,
    agent: strategyResult(agentDays),
    fixedWeeklyOrder: strategyResult(fixedDays),
    daily: agentDays.map((d, i) => ({ day: d.day, agentStockOuts: lost(d), fixedStockOuts: lost(fixedDays[i]) })),
  };
}

/**
 * The agent's stops per day: exactly as many as the fixed schedule makes that day.
 * Tested alternatives, for the record: spreading the same weekly total evenly
 * over Mon–Sat made things worse (the Monday refill after the weekend matters),
 * and fewer stops lose sales, because machine capacity is what limits this fleet.
 */
export function visitBudgets(days: Day[], machines: SimWorld["machines"]): number[] {
  return days.map((d) => fixedSchedulePlans(d, machines).length);
}

/** Run the fixed schedule from `start` over the given days (start is cloned, not changed). */
export function runFixed(start: SimWorld, days: Day[]): DayResult[] {
  const world = start.clone();
  return days.map((day) => world.runDay(day, fixedSchedulePlans(day, world.machines)));
}

/**
 * Fully in-memory comparison (no database): the planner runs each night on its
 * own copy of the world. Used by GET /api/benchmark before any fast-forward.
 */
export async function compareInMemory(opts: {
  start: SimWorld;
  from: Day;
  days: number;
  planner: NightPlanner;
  baseline: BaselineLike;
}): Promise<{ benchmark: Benchmark; plans: NightPlan[] }> {
  const days = dayRange(opts.from, addDays(opts.from, opts.days - 1));
  const agentWorld = opts.start.clone();
  const plans: NightPlan[] = [];
  const agentDays: DayResult[] = [];
  const budgets = visitBudgets(days, agentWorld.machines);
  for (const [i, day] of days.entries()) {
    const plan = await opts.planner.plan({
      day,
      machines: agentWorld.machines,
      stock: agentWorld.stock,
      baseline: opts.baseline,
      visitBudget: budgets[i],
    });
    plans.push(plan);
    agentDays.push(agentWorld.runDay(day, plan.visits));
  }
  return { benchmark: toBenchmark(opts.from, agentDays, runFixed(opts.start, days)), plans };
}
