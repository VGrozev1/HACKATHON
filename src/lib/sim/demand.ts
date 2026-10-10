// Task A3: who wants to buy what, when. This is customer *demand*; whether a
// sale actually happens depends on stock (stock.ts). Everything here is a pure
// function of the day, so demand is identical across reruns and strategies.

import type { LocationType } from "@/generated/prisma/enums";
import { holidayOn, weatherOn, dayOfWeek, type Day } from "./calendar";
import { productById, type Category, type MachineDef, type SlotDef } from "./fleet";

// ─── Shape of a day, by location type (Sofia local hours 0–23) ──────────────

// Relative weights per hour. Gyms peak after work, offices at lunch,
// hospitals are flat and never empty, the university follows lectures.
export const HOURLY_PROFILE: Record<LocationType, number[]> = {
  //            0    1    2    3    4    5    6    7    8    9   10   11   12   13   14   15   16   17   18   19   20   21   22   23
  GYM:        [0,   0,   0,   0,   0,   0,   2,   4,   4,   3,   2,   2,   3,   3,   2,   2,   3,   7,   9,   10,  9,   6,   2,   0],
  OFFICE:     [0,   0,   0,   0,   0,   0,   0,   1,   4,   5,   3,   4,   9,   10,  6,   4,   5,   3,   1,   0,   0,   0,   0,   0],
  HOSPITAL:   [1,   1,   1,   0.5, 0.5, 1,   2,   4,   6,   7,   7,   7,   8,   7,   6,   6,   6,   5,   4,   3,   3,   2,   2,   1],
  UNIVERSITY: [0,   0,   0,   0,   0,   0,   0,   1,   3,   6,   7,   7,   9,   9,   7,   6,   5,   4,   2,   1,   0,   0,   0,   0],
  OTHER:      Array(24).fill(1),
};

// Sunday … Saturday.
const DAY_OF_WEEK_FACTOR: Record<LocationType, number[]> = {
  GYM: [0.8, 1.15, 1.05, 1.05, 1.0, 0.9, 0.95],
  OFFICE: [0.08, 1.0, 1.05, 1.05, 1.0, 0.85, 0.12],
  HOSPITAL: [0.8, 1.05, 1.05, 1.0, 1.0, 1.0, 0.85],
  UNIVERSITY: [0.15, 1.0, 1.05, 1.05, 1.0, 0.85, 0.25],
  OTHER: [1, 1, 1, 1, 1, 1, 1],
};

// Units per day for a typical machine of each type on a normal weekday.
const BASE_DAILY_UNITS: Record<LocationType, number> = {
  GYM: 58,
  OFFICE: 78,
  HOSPITAL: 64,
  UNIVERSITY: 85,
  OTHER: 40,
};

const HOLIDAY_FACTOR: Record<LocationType, number> = {
  GYM: 0.85,
  OFFICE: 0.08,
  HOSPITAL: 0.9,
  UNIVERSITY: 0.1,
  OTHER: 0.7,
};

/** Slow seasonal effects: summer holidays at offices, term time at the university. */
function seasonFactor(type: LocationType, day: Day): number {
  const md = day.slice(5); // "MM-DD"
  if (type === "OFFICE" && md >= "08-01" && md <= "08-31") return 0.8; // people on holiday
  if (type === "UNIVERSITY") {
    if (md >= "07-01" && md < "09-15") return 0.2; // summer break
    if (md >= "09-15" && md < "10-01") return 0.45; // exams and enrolment
  }
  return 1;
}

/** Cold drinks sell more when it's hot; rain dampens them a little. */
export function weatherFactor(category: Category, day: Day): number {
  const { tMaxC, rainy } = weatherOn(day);
  const rain = rainy ? 0.9 : 1;
  if (category === "drink") return Math.min(1.6, Math.max(0.7, 1 + 0.035 * (tMaxC - 22))) * rain;
  if (category === "energy") return Math.min(1.25, Math.max(0.85, 1 + 0.012 * (tMaxC - 22)));
  if (category === "coffee") return Math.min(1.2, Math.max(0.85, 1 + 0.01 * (tMaxC - 22)));
  return 1;
}

/** Expected units the whole machine would sell on `day` with unlimited stock (before weather). */
export function machineDailyUnits(machine: MachineDef, day: Day): number {
  const type = machine.locationType;
  const holiday = holidayOn(day) ? HOLIDAY_FACTOR[type] : 1;
  return (
    BASE_DAILY_UNITS[type] *
    machine.traffic *
    DAY_OF_WEEK_FACTOR[type][dayOfWeek(day)] *
    holiday *
    seasonFactor(type, day)
  );
}

/**
 * True mean demand for one slot on one day: the number the forecast (A5) tries
 * to estimate. The machine's demand is shared across its slots by product
 * appeal, then adjusted for weather.
 */
export function expectedSlotDemand(machine: MachineDef, slots: SlotDef[], slot: SlotDef, day: Day): number {
  const type = machine.locationType;
  const appeal = (s: SlotDef) => productById.get(s.productId)?.appeal[type] ?? 0.5;
  const share = appeal(slot) / slots.reduce((sum, s) => sum + appeal(s), 0);
  const product = productById.get(slot.productId)!;
  return machineDailyUnits(machine, day) * share * weatherFactor(product.category, day);
}
