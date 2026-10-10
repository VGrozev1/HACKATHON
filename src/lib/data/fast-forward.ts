// Task A7: fast-forward the simulation N days with the agent running each night.
//
// Each day:  refresh the forecast (A5) → the planner plans the night → its run,
// orders and visits are stored → the day's customers buy (generator) → sales,
// stock and stock-outs are stored → the sim clock moves on.
//
// Meanwhile the fixed weekly order replays the same days in memory from the
// same starting snapshot, which gives the benchmark (A8) for exactly this run.

import { db } from "@/lib/db";
import type { FastForwardResponse, LoadItem } from "@/lib/api-types";
import { toSaleEventRow } from "@/lib/sale-event";
import { addDays, dayRange, type Day } from "@/lib/sim/calendar";
import { MACHINES, SLOTS, SUPPLIERS, productById } from "@/lib/sim/fleet";
import { runFixed, toBenchmark, visitBudgets } from "@/lib/sim/benchmark";
import { ruleBasedPlanner, type NightPlan, type NightPlanner } from "@/lib/sim/planner";
import { SimWorld, type DayResult, type StockOutInterval } from "@/lib/sim/world";
import { computeBaseline } from "./forecast";
import { getSimToday, setSimToday } from "./sim-clock";
import { loadStock, saveStock } from "./stock";

export const MAX_FAST_FORWARD_DAYS = 14;
const autoApproveLimit = () => Number(process.env.AUTO_APPROVE_LIMIT_EUR ?? 300);

/** The simulation world as the database has it now: stock batches and open stock-outs. */
export async function loadWorld(): Promise<SimWorld> {
  const [stock, open] = await Promise.all([
    loadStock(),
    db.stockOut.findMany({ where: { endedAt: null } }),
  ]);
  for (const slot of SLOTS) if (!stock.has(slot.id)) stock.set(slot.id, []);
  return new SimWorld({ stock, openStockOuts: new Map(open.map((o) => [o.slotId, o.startedAt])), machines: MACHINES });
}

export async function fastForward(opts: { days: number; planner?: NightPlanner }): Promise<FastForwardResponse> {
  const planner = opts.planner ?? ruleBasedPlanner;
  const today = await getSimToday();
  const from = addDays(today, 1);
  const days = dayRange(from, addDays(today, opts.days));

  const world = await loadWorld();
  const fixedStart = world.clone();
  const agentDays: DayResult[] = [];
  const runIds: string[] = [];
  let persistedClosed = 0;
  const budgets = visitBudgets(days, world.machines);

  for (const [i, day] of days.entries()) {
    const baseline = await computeBaseline(addDays(day, -1));
    const plan = await planner.plan({
      day,
      machines: world.machines,
      stock: world.stock,
      baseline,
      visitBudget: budgets[i],
    });
    const runId = await saveNight(day, plan, planner.name);
    runIds.push(runId);

    const result = world.runDay(day, plan.visits);
    agentDays.push(result);
    await saveDay(result, runId);
    await saveStock(world.stock);
    persistedClosed = await saveStockOuts(world, persistedClosed);
    await setSimToday(day);
  }

  const benchmark = toBenchmark(from, agentDays, runFixed(fixedStart, days));
  await db.simState.update({ where: { id: "singleton" }, data: { lastBenchmark: JSON.parse(JSON.stringify(benchmark)) } });
  return { daysSimulated: days.length, runIds, benchmark };
}

/** Store the planner's night: an AgentRun with steps and decisions, plus purchase orders. */
async function saveNight(day: Day, plan: NightPlan, plannerName: string): Promise<string> {
  const now = new Date();
  const units = plan.visits.reduce((n, v) => n + v.loadList.reduce((m, l) => m + (l.quantity ?? 0), 0), 0);
  const steps = [
    { at: now.toISOString(), type: "thought", text: `Planning ${day} with ${plannerName}.` },
    { at: now.toISOString(), type: "tool_call", tool: "get_stock", input: { machineIds: "all" } },
    { at: now.toISOString(), type: "tool_call", tool: "forecast", input: { day } },
    ...plan.decisions.map((d) => ({ at: now.toISOString(), type: "decision", text: `${d.summary}. ${d.reason}` })),
  ];
  const run = await db.agentRun.create({
    data: {
      runDate: new Date(`${day}T00:00:00Z`),
      status: "SUCCEEDED",
      steps,
      decisions: plan.decisions.map(({ kind, summary, reason }) => ({ kind, summary, reason })),
      explanation: `${plan.explanation} ${units} units across ${plan.visits.length} stops.`.trim(),
      finishedAt: now,
    },
  });

  // Warehouse replenishment for what tonight's route loads, one order per supplier.
  const qty = new Map<string, number>();
  for (const v of plan.visits) {
    for (const l of v.loadList) {
      const productId = SLOTS.find((s) => s.id === l.slotId)!.productId;
      qty.set(productId, (qty.get(productId) ?? 0) + (l.quantity ?? 0));
    }
  }
  for (const supplier of SUPPLIERS) {
    const lines = [...qty]
      .filter(([pid, n]) => n > 0 && productById.get(pid)!.supplierId === supplier.id)
      .map(([pid, n]) => ({ productId: pid, quantity: n, unitCost: productById.get(pid)!.cost }));
    const total = Math.round(lines.reduce((n, l) => n + l.quantity * l.unitCost, 0) * 100) / 100;
    if (!lines.length || total < supplier.minOrderValue) continue; // too small: rides on a later order
    const auto = total <= autoApproveLimit();
    await db.purchaseOrder.create({
      data: {
        supplierId: supplier.id,
        status: auto ? "SENT" : "AWAITING_APPROVAL",
        total,
        deliveryDate: new Date(`${addDays(day, supplier.leadTimeDays)}T00:00:00Z`),
        explanation: `Replenish the warehouse for ${day}'s route (${lines.length} products).${auto ? "" : ` Over €${autoApproveLimit()}: needs approval.`}`,
        agentRunId: run.id,
        lines: { create: lines },
      },
    });
  }
  return run.id;
}

/** Store one simulated day: the visits that happened and the sales. */
async function saveDay(result: DayResult, runId: string) {
  const slotById = new Map(SLOTS.map((s) => [s.id, s]));
  await db.visit.createMany({
    data: result.visits.map((v) => ({
      date: new Date(`${v.day}T00:00:00Z`),
      routeOrder: v.routeOrder,
      machineId: v.machineId,
      status: "DONE" as const,
      loadList: v.loadList satisfies LoadItem[],
      agentRunId: runId,
      doneAt: v.at,
      wastedUnits: v.wasted,
    })),
  });
  const rows = result.sales.map((e) => toSaleEventRow(e, slotById.get(`${e.MachineId}-${e.ProductSelection}`)!));
  for (let i = 0; i < rows.length; i += 5000) await db.saleEvent.createMany({ data: rows.slice(i, i + 5000) });
}

/** Replace open stock-outs with the world's current ones and append newly closed ones. */
async function saveStockOuts(world: SimWorld, alreadyPersisted: number): Promise<number> {
  const newlyClosed: StockOutInterval[] = world.closedStockOuts.slice(alreadyPersisted);
  const open = world.stockOutIntervals().filter((s) => s.endedAt === null);
  await db.$transaction([
    db.stockOut.deleteMany({ where: { endedAt: null } }),
    db.stockOut.createMany({ data: [...newlyClosed, ...open] }),
  ]);
  return world.closedStockOuts.length;
}
