// Task A9 (stretch): cash check. At each visit the stocker empties the coin box;
// the machine's fiscal memory says how much cash it took since the last visit.
// They should match within a few coins. A gap means a jammed coin mechanism,
// a faulty validator, or theft, and feeds the "what's wrong" alerts (B8).
//
// Collections are simulated: fiscal cash ± small counting noise, except a couple
// of machines with a deliberate fault so the demo has something to find.

import { db } from "@/lib/db";
import { rngFor } from "@/lib/sim/random";

/** Simulated faults: share of cash that never reaches the box. */
const CASH_FAULTS: Record<string, { shortfall: number; likelyCause: string }> = {
  "SOF-OFF-04": { shortfall: 0.18, likelyCause: "Coin mechanism jams: coins drop to the reject tray" },
  "SOF-GYM-06": { shortfall: 0.09, likelyCause: "Possible theft: shortfall only on evening-shift collections" },
};

/** Gaps smaller than this (and under €2) are counting noise. */
const TOLERANCE = 0.03;

export interface CashCheck {
  machineId: string;
  from: string; // previous collection
  to: string; // this collection
  fiscalCash: number; // € the machine recorded as cash sales
  collected: number; // € the stocker counted
  difference: number; // collected − fiscal (negative = missing)
  mismatch: boolean;
  likelyCause: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Compare what the stocker counted with what the fiscal memory says. */
function reconcile(machineId: string, from: Date, to: Date, fiscal: number): CashCheck {
  const fiscalCash = round2(fiscal);
  const fault = CASH_FAULTS[machineId];
  const noise = (rngFor("cash", machineId, to.toISOString())() - 0.5) * 0.02; // ±1% miscount
  const collected = round2(fiscalCash * (1 - (fault?.shortfall ?? 0) + noise));
  const difference = round2(collected - fiscalCash);
  const mismatch = Math.abs(difference) > Math.max(2, fiscalCash * TOLERANCE);
  return {
    machineId,
    from: from.toISOString(),
    to: to.toISOString(),
    fiscalCash,
    collected,
    difference,
    mismatch,
    likelyCause: mismatch ? (fault?.likelyCause ?? "Unexplained gap; check the coin box and validator") : null,
  };
}

/** Cash reconciliation for the last `count` collections (visits) of one machine. */
export async function cashChecks(machineId: string, count = 6): Promise<CashCheck[]> {
  const visits = await db.visit.findMany({
    where: { machineId, status: "DONE", doneAt: { not: null } },
    orderBy: { doneAt: "desc" },
    take: count + 1,
  });
  const checks: CashCheck[] = [];
  for (let i = 0; i < visits.length - 1; i++) {
    const to = visits[i].doneAt!;
    const from = visits[i + 1].doneAt!;
    const agg = await db.saleEvent.aggregate({
      where: { machineId, paymentType: "CASH", occurredAt: { gte: from, lt: to } },
      _sum: { price: true },
    });
    checks.push(reconcile(machineId, from, to, agg._sum.price ?? 0));
  }
  return checks;
}

/** Latest collection per machine that doesn't match, in one query (for fleet alerts). */
export async function cashMismatches(): Promise<Map<string, CashCheck>> {
  const rows = await db.$queryRaw<{ machineId: string; fromAt: Date; toAt: Date; cash: number }[]>`
    WITH v AS (
      SELECT "machineId", "doneAt",
             ROW_NUMBER() OVER (PARTITION BY "machineId" ORDER BY "doneAt" DESC) AS rn
      FROM "Visit" WHERE status = 'DONE' AND "doneAt" IS NOT NULL
    ), w AS (
      SELECT a."machineId", b."doneAt" AS "fromAt", a."doneAt" AS "toAt"
      FROM v a JOIN v b ON a."machineId" = b."machineId" AND a.rn = 1 AND b.rn = 2
    )
    SELECT w."machineId", w."fromAt", w."toAt",
           COALESCE(SUM(s.price) FILTER (WHERE s."paymentType" = 'CASH'), 0)::float AS cash
    FROM w LEFT JOIN "SaleEvent" s
      ON s."machineId" = w."machineId" AND s."occurredAt" >= w."fromAt" AND s."occurredAt" < w."toAt"
    GROUP BY 1, 2, 3`;
  const out = new Map<string, CashCheck>();
  for (const r of rows) {
    const check = reconcile(r.machineId, r.fromAt, r.toAt, r.cash);
    if (check.mismatch) out.set(r.machineId, check);
  }
  return out;
}
