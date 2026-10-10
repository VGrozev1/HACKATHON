// Task A5: the forecast baseline, from the last 4 weeks of sales: for each slot,
// its average daily demand on each weekday.
//
// Sales stop when a slot is empty, so a plain average of sales would read
// "sold out by noon" as "nobody wants it in the afternoon", and under the old
// fixed schedule a gym's water is gone every Sunday, which would forecast zero.
// So each day's sales are divided by the share of that day's customer traffic
// the slot was actually stocked for (from the StockOut periods A4 records and
// the machine's own hourly sales pattern). Days stocked for under a quarter of
// the traffic are skipped. If a slot has no usable day for a weekday, it falls
// back to machine-level traffic that weekday × the product's share of sales.
//
// The agent (B4) adjusts this for weather and holidays.

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { MachineForecast, SlotForecast } from "@/lib/api-types";
import { addDays, dayOfWeek, dayRange, sofiaTime, type Day } from "@/lib/sim/calendar";

export const BASELINE_WEEKS = 4;
const MIN_IN_STOCK_SHARE = 0.25;

/** slotId → expected units per weekday (index 0 = Sunday). */
export type Baseline = Map<string, number[]>;

type Interval = { startedAt: Date; endedAt: Date | null };

/** Share of a day's customer traffic (by the machine's hourly pattern) that falls inside the intervals. */
function trafficShareCovered(day: Day, hourly: number[], intervals: Interval[], until: Date): number {
  let covered = 0;
  for (let h = 0; h < 24; h++) {
    if (!hourly[h]) continue;
    const hs = sofiaTime(day, h).getTime();
    const he = hs + 3600000;
    for (const iv of intervals) {
      const a = Math.max(hs, iv.startedAt.getTime());
      const b = Math.min(he, (iv.endedAt ?? until).getTime());
      if (b > a) covered += ((b - a) / 3600000) * hourly[h];
    }
  }
  return Math.min(1, covered);
}

/** Baseline from the 4 full weeks ending on `asOf` (inclusive). */
export async function computeBaseline(asOf: Day, machineIds?: string[]): Promise<Baseline> {
  const firstDay = addDays(asOf, -(BASELINE_WEEKS * 7 - 1));
  const from = sofiaTime(firstDay, 0);
  const to = sofiaTime(addDays(asOf, 1), 0);
  const machineFilter = machineIds ? { machineId: { in: machineIds } } : {};
  // Same filter in SQL; the "no filter" branch keeps one prepared statement for the fleet.
  const onlyMachines = machineIds ? Prisma.sql`AND "machineId" IN (${Prisma.join(machineIds)})` : Prisma.empty;

  const [slotDays, hourlyRows, stockOuts, slots] = await Promise.all([
    db.$queryRaw<{ slotId: string; day: Date; n: number }[]>`
      SELECT "slotId", ((("occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Sofia')::date) AS day, COUNT(*)::int AS n
      FROM "SaleEvent" WHERE "occurredAt" >= ${from} AND "occurredAt" < ${to} ${onlyMachines}
      GROUP BY 1, 2`,
    db.$queryRaw<{ machineId: string; hour: number; n: number }[]>`
      SELECT "machineId", EXTRACT(HOUR FROM ("occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Sofia')::int AS hour, COUNT(*)::int AS n
      FROM "SaleEvent" WHERE "occurredAt" >= ${from} AND "occurredAt" < ${to} ${onlyMachines}
      GROUP BY 1, 2`,
    db.stockOut.findMany({
      where: { ...machineFilter, startedAt: { lt: to }, OR: [{ endedAt: null }, { endedAt: { gt: from } }] },
      select: { slotId: true, startedAt: true, endedAt: true },
    }),
    db.slot.findMany({ where: machineFilter, select: { id: true, machineId: true, productId: true } }),
  ]);

  const sold = new Map(slotDays.map((r) => [`${r.slotId}|${r.day.toISOString().slice(0, 10)}`, r.n]));
  const hourly = new Map<string, number[]>();
  for (const r of hourlyRows) {
    const h = hourly.get(r.machineId) ?? Array(24).fill(0);
    h[r.hour] += r.n;
    hourly.set(r.machineId, h);
  }
  for (const [id, h] of hourly) {
    const total = h.reduce((a: number, b: number) => a + b, 0);
    hourly.set(id, h.map((x: number) => x / total));
  }
  const outsBySlot = new Map<string, Interval[]>();
  for (const o of stockOuts) outsBySlot.set(o.slotId, [...(outsBySlot.get(o.slotId) ?? []), o]);

  // 1. Per slot and weekday: average of the in-stock-adjusted daily estimates.
  const days = dayRange(firstDay, asOf);
  const perSlot = new Map<string, (number | null)[]>();
  for (const slot of slots) {
    const shape = hourly.get(slot.machineId) ?? Array(24).fill(1 / 24);
    const outs = outsBySlot.get(slot.id) ?? [];
    const estimates: number[][] = [[], [], [], [], [], [], []];
    for (const day of days) {
      const inStock = 1 - trafficShareCovered(day, shape, outs, to);
      if (inStock < MIN_IN_STOCK_SHARE) continue;
      estimates[dayOfWeek(day)].push((sold.get(`${slot.id}|${day}`) ?? 0) / inStock);
    }
    perSlot.set(slot.id, estimates.map((xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)));
  }

  // 2. Weekdays a slot was (almost) never stocked on: its usual level × how busy
  //    the machine is that weekday, judged only from slots that were stocked.
  const weekdayFactor = machineWeekdayFactors(slots, perSlot);
  const fallback = mixFallback(slots, slotDays);
  const baseline: Baseline = new Map();
  for (const slot of slots) {
    const est = perSlot.get(slot.id)!;
    const known = est.filter((x): x is number => x !== null);
    const level = known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
    const factors = weekdayFactor.get(slot.machineId)!;
    baseline.set(
      slot.id,
      est.map((x, dow) => x ?? (level !== null && factors[dow] !== null ? level * factors[dow]! : fallback.get(slot.id)![dow])),
    );
  }
  return baseline;
}

/**
 * Per machine, how busy each weekday is relative to the slot's average day:
 * Σ estimate(weekday) / Σ average-level, over the slots that have an estimate.
 */
function machineWeekdayFactors(
  slots: { id: string; machineId: string }[],
  perSlot: Map<string, (number | null)[]>,
): Map<string, (number | null)[]> {
  const sums = new Map<string, { est: number[]; level: number[] }>();
  for (const slot of slots) {
    const est = perSlot.get(slot.id)!;
    const known = est.filter((x): x is number => x !== null);
    if (!known.length) continue;
    const level = known.reduce((a, b) => a + b, 0) / known.length;
    const acc = sums.get(slot.machineId) ?? { est: Array(7).fill(0), level: Array(7).fill(0) };
    est.forEach((x, dow) => {
      if (x === null) return;
      acc.est[dow] += x;
      acc.level[dow] += level;
    });
    sums.set(slot.machineId, acc);
  }
  return new Map(
    slots.map((s) => {
      const acc = sums.get(s.machineId);
      return [s.machineId, Array.from({ length: 7 }, (_, dow) => (acc && acc.level[dow] > 0 ? acc.est[dow] / acc.level[dow] : null))];
    }),
  );
}

/** Machine-level weekday traffic × the product's share of sales, split across its slots. */
function mixFallback(
  slots: { id: string; machineId: string; productId: string }[],
  slotDays: { slotId: string; day: Date; n: number }[],
): Map<string, number[]> {
  const productOf = new Map(slots.map((s) => [s.id, s]));
  const machineDow = new Map<string, number[]>();
  const productUnits = new Map<string, number>();
  const machineUnits = new Map<string, number>();
  for (const r of slotDays) {
    const slot = productOf.get(r.slotId);
    if (!slot) continue;
    const perDow = machineDow.get(slot.machineId) ?? [0, 0, 0, 0, 0, 0, 0];
    perDow[r.day.getUTCDay()] += r.n / BASELINE_WEEKS;
    machineDow.set(slot.machineId, perDow);
    const key = `${slot.machineId}|${slot.productId}`;
    productUnits.set(key, (productUnits.get(key) ?? 0) + r.n);
    machineUnits.set(slot.machineId, (machineUnits.get(slot.machineId) ?? 0) + r.n);
  }
  const slotsPerProduct = new Map<string, number>();
  for (const s of slots) slotsPerProduct.set(`${s.machineId}|${s.productId}`, (slotsPerProduct.get(`${s.machineId}|${s.productId}`) ?? 0) + 1);
  return new Map(
    slots.map((s) => {
      const key = `${s.machineId}|${s.productId}`;
      const total = machineUnits.get(s.machineId) ?? 0;
      const share = total ? (productUnits.get(key) ?? 0) / total / slotsPerProduct.get(key)! : 0;
      return [s.id, (machineDow.get(s.machineId) ?? [0, 0, 0, 0, 0, 0, 0]).map((u) => u * share)];
    }),
  );
}

/** Expected units for one slot over the days from..until (inclusive). */
export function expectedUnits(baseline: Baseline, slotId: string, from: Day, until: Day): number {
  const perDow = baseline.get(slotId);
  if (!perDow) return 0;
  return dayRange(from, until).reduce((sum, d) => sum + perDow[dayOfWeek(d)], 0);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** GET /api/machines/:id/forecast: tomorrow until the next planned visit, plus 14 days of forecast vs actual. */
export async function machineForecast(machineId: string, today: Day): Promise<MachineForecast> {
  const from = addDays(today, 1);
  const nextVisit = await db.visit.findFirst({
    where: { machineId, status: { in: ["PLANNED", "SENT"] }, date: { gte: new Date(`${from}T00:00:00Z`) } },
    orderBy: { date: "asc" },
  });
  const until = nextVisit ? nextVisit.date.toISOString().slice(0, 10) : from;

  const baseline = await computeBaseline(today, [machineId]);
  const slots = await db.slot.findMany({ where: { machineId }, orderBy: { code: "asc" } });
  const slotForecasts: SlotForecast[] = slots.map((s) => ({
    slotId: s.id,
    productId: s.productId,
    baseline: round1(expectedUnits(baseline, s.id, from, until)),
    adjusted: null, // B4: the agent's weather/holiday adjustment
    reason: null,
  }));

  return { machineId, from, until, slots: slotForecasts, history: await forecastHistory(machineId, today, 14) };
}

/**
 * Machine-level forecast vs actual for the last `days` days. Each day's forecast
 * uses only the 4 weeks before it, the way it would have been made that night.
 */
async function forecastHistory(machineId: string, today: Day, days: number) {
  const first = addDays(today, -(days - 1) - BASELINE_WEEKS * 7);
  const rows = await db.$queryRaw<{ day: Date; n: number }[]>`
    SELECT ((("occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Sofia')::date) AS day, COUNT(*)::int AS n
    FROM "SaleEvent"
    WHERE "machineId" = ${machineId}
      AND "occurredAt" >= ${sofiaTime(first, 0)} AND "occurredAt" < ${sofiaTime(addDays(today, 1), 0)}
    GROUP BY 1`;
  const sold = new Map(rows.map((r) => [r.day.toISOString().slice(0, 10), r.n]));
  return dayRange(addDays(today, -(days - 1)), today).map((day) => {
    const sameWeekday = Array.from({ length: BASELINE_WEEKS }, (_, w) => sold.get(addDays(day, -7 * (w + 1))) ?? 0);
    return {
      day,
      forecast: round1(sameWeekday.reduce((a, b) => a + b, 0) / BASELINE_WEEKS),
      actual: sold.get(day) ?? 0,
    };
  });
}

/**
 * The agent's forecast tool shape: per product (summed over its slots), for
 * the next `days` days starting tomorrow. misses.ts reads exactly
 * { machine_id, forecast: [{ product, avgDailySales }] }, so keep it stable.
 */
export async function agentForecast(machineId: string, today: Day, days: number) {
  const from = addDays(today, 1);
  const until = addDays(today, days);
  const [baseline, slots] = await Promise.all([
    computeBaseline(today, [machineId]),
    db.slot.findMany({ where: { machineId }, include: { product: true }, orderBy: { code: "asc" } }),
  ]);
  const byProduct = new Map<string, { product: string; product_id: string; total: number }>();
  for (const s of slots) {
    const entry = byProduct.get(s.productId) ?? { product: s.product.name, product_id: s.productId, total: 0 };
    entry.total += expectedUnits(baseline, s.id, from, until);
    byProduct.set(s.productId, entry);
  }
  return {
    machine_id: machineId,
    days,
    from,
    until,
    forecast: [...byProduct.values()].map((p) => ({
      product: p.product,
      product_id: p.product_id,
      avgDailySales: round1(p.total / days),
      expectedUnits: Math.round(p.total),
    })),
  };
}
