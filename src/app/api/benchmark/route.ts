// GET /api/benchmark — agent vs fixed weekly order (A8), the "one number".
// After a fast-forward: the result of that run. Before any: a dry run of the next
// 7 days in memory from the current state (nothing is saved).
import { connection } from "next/server";
import { db } from "@/lib/db";
import type { Benchmark } from "@/lib/api-types";
import { computeBaseline } from "@/lib/data/forecast";
import { loadWorld } from "@/lib/data/fast-forward";
import { getSimToday } from "@/lib/data/sim-clock";
import { addDays } from "@/lib/sim/calendar";
import { compareInMemory } from "@/lib/sim/benchmark";
import { ruleBasedPlanner } from "@/lib/sim/planner";

export const maxDuration = 60;

export async function GET() {
  await connection(); // live data: never prerender at build
  const state = await db.simState.findUnique({ where: { id: "singleton" } });
  if (state?.lastBenchmark) return Response.json(state.lastBenchmark as unknown as Benchmark);

  const today = await getSimToday();
  const [start, baseline] = await Promise.all([loadWorld(), computeBaseline(today)]);
  const { benchmark } = await compareInMemory({ start, from: addDays(today, 1), days: 7, planner: ruleBasedPlanner, baseline });
  return Response.json(benchmark);
}
