// Agent (planner) vs fixed weekly order over the next N days, fully in memory,
// starting from the current database stock. Doesn't change anything.
// `npm run sim:benchmark -- 7`

import "dotenv/config";
import { db } from "../src/lib/db";
import { computeBaseline } from "../src/lib/data/forecast";
import { getSimToday } from "../src/lib/data/sim-clock";
import { loadWorld } from "../src/lib/data/fast-forward";
import { addDays } from "../src/lib/sim/calendar";
import { compareInMemory } from "../src/lib/sim/benchmark";
import { ruleBasedPlanner } from "../src/lib/sim/planner";

async function main() {
  const days = Number(process.argv[2] ?? 7);
  const today = await getSimToday();
  const t0 = Date.now();
  const [world, baseline] = await Promise.all([loadWorld(), computeBaseline(today)]);
  const { benchmark: b, plans } = await compareInMemory({ start: world, from: addDays(today, 1), days, planner: ruleBasedPlanner, baseline });
  console.log(`${b.from} → ${b.until} (${days} days, ${Date.now() - t0} ms), planner: ${ruleBasedPlanner.name}`);
  console.log("                 missed sales  expired  visits  lost €   wasted €");
  for (const [name, r] of [["agent", b.agent], ["fixed weekly", b.fixedWeeklyOrder]] as const) {
    console.log(`  ${name.padEnd(14)} ${String(r.stockOuts).padStart(10)}  ${String(r.expiredUnits).padStart(7)}  ${String(r.visits).padStart(6)}  ${r.lostRevenue.toFixed(0).padStart(6)}  ${r.wastedCost.toFixed(0).padStart(8)}`);
  }
  const cut = (a: number, f: number) => (f ? `${Math.round(100 * (1 - a / f))}%` : "n/a");
  console.log(`  → ${cut(b.agent.stockOuts, b.fixedWeeklyOrder.stockOuts)} fewer missed sales, ${cut(b.agent.expiredUnits, b.fixedWeeklyOrder.expiredUnits)} less waste`);
  console.log("\nDaily missed sales (agent / fixed):", b.daily.map((d) => `${d.day.slice(5)} ${d.agentStockOuts}/${d.fixedStockOuts}`).join("  "));
  console.log("\nFirst night:", plans[0].explanation);
  plans[0].decisions.slice(0, 4).forEach((d) => console.log(`  - ${d.summary} (${d.reason})`));
}

main().finally(() => db.$disconnect());
