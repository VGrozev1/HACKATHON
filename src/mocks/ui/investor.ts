// The week-long benchmark for mock mode: agent vs a fixed weekly order on the same demand.
// From the original UI brief, not from the team simulation: replace with A8 results.

import type { BenchmarkResult } from "@/types";

export const benchmarkResult: BenchmarkResult = {
  days: 7,
  agent: { stockOuts: 2, expiredProducts: 3, revenue: 11842 },
  fixedOrder: { stockOuts: 14, expiredProducts: 11, revenue: 11036 },
  daily: [
    { date: "2026-10-11", agentStockOuts: 0, fixedStockOuts: 0 },
    { date: "2026-10-12", agentStockOuts: 1, fixedStockOuts: 1 },
    { date: "2026-10-13", agentStockOuts: 0, fixedStockOuts: 1 },
    { date: "2026-10-14", agentStockOuts: 0, fixedStockOuts: 2 },
    { date: "2026-10-15", agentStockOuts: 1, fixedStockOuts: 3 },
    { date: "2026-10-16", agentStockOuts: 0, fixedStockOuts: 3 },
    { date: "2026-10-17", agentStockOuts: 0, fixedStockOuts: 4 },
  ],
};
