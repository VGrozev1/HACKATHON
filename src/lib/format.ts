// Display formatting shared by every screen: € amounts, "Sat 10 Oct" dates, 24-hour times.
// The fleet is in Sofia, so dates and times render in Europe/Sofia whatever the laptop's zone.

const TZ = "Europe/Sofia";

/** The simulated "now" the demo runs at: Saturday evening, just before the nightly run. */
export const DEMO_NOW = new Date("2026-10-10T17:15:00Z");

const eur = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });
const eurRound = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const dayFmt = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: TZ,
});
const shortDayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: TZ });
const timeFmt = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: TZ,
});
const timeSecFmt = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: TZ,
});
const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: TZ });

/** "€1,234.50" */
export const formatEUR = (n: number) => eur.format(n);
/** "€1,235" */
export const formatEURRound = (n: number) => eurRound.format(n);

/** Accepts "YYYY-MM-DD" (read as noon UTC so it never slips a day) or a full ISO string. */
function toDate(d: string | Date): Date {
  if (d instanceof Date) return d;
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00Z`) : new Date(d);
}

/** "Sat 10 Oct" */
export const formatDate = (d: string | Date) => dayFmt.format(toDate(d)).replace(",", "");
/** "10 Oct", for chart axes */
export const formatShortDate = (d: string | Date) => shortDayFmt.format(toDate(d));
/** "21:04" */
export const formatTime = (d: string | Date) => timeFmt.format(toDate(d));
/** "21:04:37" */
export const formatTimeSec = (d: string | Date) => timeSecFmt.format(toDate(d));
/** "2026-09" → "September 2026" */
export const formatMonth = (month: string) => monthFmt.format(new Date(`${month}-15T12:00:00Z`));

/** "YYYY-MM-DD" in Sofia time */
export function dayKey(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return parts;
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Whole days from DEMO_NOW until the given date (negative if in the past). */
export function daysUntil(d: string): number {
  return Math.floor((toDate(d).getTime() - DEMO_NOW.getTime()) / 86_400_000);
}
