// 60 days of believable sales per machine, plus forecast vs actual.
// Gyms peak at weekends, offices drop at weekends and in the August holidays,
// the hospital stays flat; public holidays dip; a little seeded noise on top.

import type { ForecastPoint, LocationType, SalesPoint } from "@/types";
import { addDays, DEMO_NOW, dayKey } from "@/lib/format";
import { machineSeedById } from "./fleet";
import { round2, seeded, seedFrom } from "./random";

export const TODAY = dayKey(DEMO_NOW); // "2026-10-10"

/** Bulgarian public holidays inside the 60-day window. */
const HOLIDAYS = new Set(["2026-09-07", "2026-09-22"]); // Unification Day (observed), Independence Day

const BASE_UNITS: Record<LocationType, number> = { gym: 38, office: 52, hospital: 44 };
const AVG_PRICE: Record<LocationType, number> = { gym: 2.65, office: 2.15, hospital: 2.4 };
/** Share of a full day's sales already made by 20:15 on the demo evening. */
const DONE_BY_NOW: Record<LocationType, number> = { gym: 0.72, office: 0.97, hospital: 0.82 };

function dayFactor(type: LocationType, day: string): number {
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  let f = 1;
  if (type === "gym") f = [1.25, 1.0, 1.05, 1.0, 1.05, 0.92, 1.35][dow];
  if (type === "office") f = [0.12, 1.0, 1.04, 1.02, 1.0, 0.86, 0.22][dow];
  if (type === "hospital") f = [0.94, 1.02, 1.0, 1.0, 1.01, 1.0, 0.95][dow];
  if (HOLIDAYS.has(day)) f *= type === "office" ? 0.15 : type === "gym" ? 0.7 : 0.92;
  if (type === "office" && day < "2026-09-01") f *= 0.8; // summer holidays
  if (type === "gym" && day >= "2026-09-14") f *= 1.08; // back-to-gym September
  return f;
}

/** What a 4-week day-of-week average would expect for this machine on this day (no noise). */
export function expectedUnits(machineId: string, day: string): number {
  const seed = machineSeedById.get(machineId);
  if (!seed) return 0;
  return BASE_UNITS[seed.locationType] * seed.traffic * dayFactor(seed.locationType, day);
}

const salesCache = new Map<string, SalesPoint[]>();

/** Daily sales, oldest first, ending today (today is partial). */
export function salesFor(machineId: string, days = 60): SalesPoint[] {
  let all = salesCache.get(machineId);
  if (!all) {
    all = buildSales(machineId);
    salesCache.set(machineId, all);
  }
  return all.slice(-days);
}

function buildSales(machineId: string): SalesPoint[] {
  const seed = machineSeedById.get(machineId);
  if (!seed) return [];
  const rand = seeded(seedFrom(machineId + ":sales"));
  const out: SalesPoint[] = [];
  for (let i = 89; i >= 0; i--) {
    const day = addDays(TODAY, -i);
    const noise = 1 + (rand() - 0.5) * 0.24;
    let units = expectedUnits(machineId, day) * noise;
    if (day === TODAY) {
      units *= DONE_BY_NOW[seed.locationType];
      if (machineId === "SOF-OFF-02") units = 6; // went offline at 09:42
      if (machineId === "SOF-OFF-07") units = 4; // stopped selling at 11:20
    }
    const n = Math.max(0, Math.round(units));
    const price = AVG_PRICE[seed.locationType] * (1 + (rand() - 0.5) * 0.08);
    out.push({ date: day, units: n, revenue: round2(n * price) });
  }
  return out;
}

/** Last 14 days with actuals, then today and the next 6 days as forecast only. */
export function forecastFor(machineId: string): ForecastPoint[] {
  const rand = seeded(seedFrom(machineId + ":forecast"));
  const sales = salesFor(machineId, 15);
  const points: ForecastPoint[] = [];
  for (const s of sales.slice(0, 14)) {
    const err = 1 + (rand() - 0.5) * 0.16;
    points.push({ date: s.date, forecast: Math.round(expectedUnits(machineId, s.date) * err), actual: s.units });
  }
  for (let i = 0; i < 7; i++) {
    const day = addDays(TODAY, i);
    // The agent's adjustment: a warm weekend lifts gym drinks.
    const lift = machineId === "SOF-GYM-01" && (i === 0 || i === 1) ? 1.3 : 1;
    points.push({ date: day, forecast: Math.round(expectedUnits(machineId, day) * lift), actual: null });
  }
  return points;
}
