// Monthly investor statements and the week-long benchmark, for mock mode.

import type { BenchmarkResult, InvestorStatement } from "@/types";
import { salesFor } from "./sales";
import { round2 } from "./random";

export const STATEMENT_MONTH = "2026-09";

/** Payout terms: A fixed monthly fee, B share of sales, C share of net profit. */
export const PAYOUT_TERMS = { A: 220, B: 0.15, C: 0.5 } as const;

export function investorStatementFor(machineId: string, model: "A" | "B" | "C"): InvestorStatement {
  const sales = round2(
    salesFor(machineId, 60)
      .filter((d) => d.date.startsWith(STATEMENT_MONTH))
      .reduce((s, d) => s + d.revenue, 0),
  );
  const cogs = round2(sales * 0.38);
  const rent = 90;
  const servicing = 110;
  const cardFees = round2(sales * 0.018);
  const telemetry = 15;
  const costs = round2(cogs + rent + servicing + cardFees + telemetry);
  const net = round2(sales - costs);
  const payout = round2(
    model === "A" ? PAYOUT_TERMS.A : model === "B" ? sales * PAYOUT_TERMS.B : Math.max(0, net * PAYOUT_TERMS.C),
  );
  return {
    machineId,
    month: STATEMENT_MONTH,
    sales,
    costs,
    payoutModel: model,
    payout,
    lines: [
      { label: "Gross sales", amount: sales },
      { label: "Cost of goods", amount: -cogs },
      { label: "Location rent", amount: -rent },
      { label: "Restocking and servicing", amount: -servicing },
      { label: "Card payment fees (1.8%)", amount: -cardFees },
      { label: "Telemetry and software", amount: -telemetry },
      { label: "Net profit", amount: net },
    ],
  };
}

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
