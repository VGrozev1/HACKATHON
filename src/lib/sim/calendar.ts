// Dates, Sofia time, public holidays and weather: the "outside world" both the
// simulator (demand) and the agent (B4 forecast adjustment) read from.
//
// Days are "YYYY-MM-DD" strings, handled in UTC so time zones never shift them.

export type Day = string;

/** The simulated "today": the last day of the seeded history. */
export const SIM_TODAY: Day = process.env.SIM_TODAY ?? "2026-10-10";

/** Days of sales history the seed generates, ending with SIM_TODAY. */
export const HISTORY_DAYS = 60;

export function toDate(day: Day): Date {
  return new Date(`${day}T00:00:00Z`);
}

export function addDays(day: Day, n: number): Day {
  const d = toDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Inclusive range of days. */
export function dayRange(from: Day, to: Day): Day[] {
  const out: Day[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(day: Day): number {
  return toDate(day).getUTCDay();
}

/** Sofia is UTC+3 in summer (EEST) and UTC+2 in winter (EET); EU switch dates. */
export function sofiaUtcOffsetHours(day: Day): number {
  const year = Number(day.slice(0, 4));
  const lastSunday = (month: number) => {
    const d = new Date(Date.UTC(year, month + 1, 0)); // last day of month
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    return d.toISOString().slice(0, 10);
  };
  return day >= lastSunday(2) && day < lastSunday(9) ? 3 : 2;
}

/** A moment on `day` at Sofia local time, as a UTC Date. */
export function sofiaTime(day: Day, hour: number, minute = 0, second = 0): Date {
  const d = toDate(day);
  d.setUTCHours(hour - sofiaUtcOffsetHours(day), minute, second);
  return d;
}

// ─── Public holidays (Bulgaria) ─────────────────────────────────────────────
// Offices and universities close; gyms and hospitals barely change.

export const HOLIDAYS: Record<Day, string> = {
  "2026-09-07": "Unification Day (observed; 6 Sep is a Sunday)",
  "2026-09-22": "Independence Day",
  "2026-12-24": "Christmas Eve",
  "2026-12-25": "Christmas Day",
  "2026-12-26": "Christmas (second day)",
  "2027-01-01": "New Year's Day",
};

export function holidayOn(day: Day): string | null {
  return HOLIDAYS[day] ?? null;
}

// ─── Weather (Sofia) ─────────────────────────────────────────────────────────
// A seasonal curve plus fixed day-to-day noise, with a few named events. The
// agent may read this as its "forecast" for upcoming days (B4); cold drinks sell
// noticeably more on hot days, so reading it is how the agent beats a fixed order.

export interface Weather {
  tMaxC: number; // daily maximum, °C
  rainy: boolean;
  note: string | null;
}

const WEATHER_EVENTS: { from: Day; to: Day; deltaC: number; note: string }[] = [
  { from: "2026-08-19", to: "2026-08-24", deltaC: 6, note: "Heatwave" },
  { from: "2026-10-13", to: "2026-10-16", deltaC: 9, note: "Late warm spell" },
];

// Small fixed hash so weather doesn't depend on the RNG module's sequence.
function noise(day: Day, salt: string): number {
  let h = 2166136261;
  for (const c of `${day}|${salt}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10000) / 10000; // [0, 1)
}

export function weatherOn(day: Day): Weather {
  const d = toDate(day);
  const dayOfYear = (d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000;
  // Peaks around 20 July at ~30 °C; ~18 °C by mid-October; ~2 °C in January.
  const seasonal = 16 + 14 * Math.cos((2 * Math.PI * (dayOfYear - 201)) / 365);
  const event = WEATHER_EVENTS.find((e) => day >= e.from && day <= e.to);
  const tMaxC = Math.round(seasonal + (noise(day, "t") - 0.5) * 7 + (event?.deltaC ?? 0));
  const rainy = !event && noise(day, "rain") < 0.18;
  return { tMaxC, rainy, note: event?.note ?? null };
}
