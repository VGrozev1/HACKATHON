// The app's "today" is the simulated day (SimState), not the real date:
// fast-forward (A7) moves it on. Everything that says "today" reads it here.

import { db } from "@/lib/db";
import { SIM_TODAY, addDays, sofiaTime, type Day } from "@/lib/sim/calendar";

export async function getSimToday(): Promise<Day> {
  const state = await db.simState.findUnique({ where: { id: "singleton" } });
  return state?.today ?? SIM_TODAY;
}

export async function setSimToday(today: Day): Promise<void> {
  await db.simState.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", today },
    update: { today },
  });
}

/** "Now" in the simulation: midnight after the last simulated day (night planning time). */
export function simNight(today: Day): Date {
  return sofiaTime(addDays(today, 1), 0);
}

/** The Sofia calendar day of a moment. */
export function sofiaDayOf(at: Date): Day {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sofia" }).format(at);
}
