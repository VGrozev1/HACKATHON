// How good is the A5 baseline? Compares it with the simulator's true mean
// demand (which a real business never knows) for the next few days.
// Run after seeding or fast-forwarding: `npm run sim:forecast-check`.

import "dotenv/config";
import { db } from "../src/lib/db";
import { computeBaseline, expectedUnits } from "../src/lib/data/forecast";
import { getSimToday } from "../src/lib/data/sim-clock";
import { addDays } from "../src/lib/sim/calendar";
import { expectedSlotDemand, machineDailyUnits } from "../src/lib/sim/demand";
import { MACHINES, slotsFor } from "../src/lib/sim/fleet";

async function main() {
  const today = await getSimToday();
  const baseline = await computeBaseline(today);
  console.log(`Baseline as of ${today}. Forecast vs true demand (fleet total, units):`);
  for (let i = 1; i <= 4; i++) {
    const day = addDays(today, i);
    const byType = new Map<string, { f: number; t: number }>();
    for (const m of MACHINES) {
      const slots = slotsFor(m);
      const agg = byType.get(m.locationType) ?? { f: 0, t: 0 };
      for (const s of slots) {
        agg.f += expectedUnits(baseline, s.id, day, day);
        agg.t += expectedSlotDemand(m, slots, s, day);
      }
      byType.set(m.locationType, agg);
    }
    const f = [...byType.values()].reduce((n, x) => n + x.f, 0);
    const t = [...byType.values()].reduce((n, x) => n + x.t, 0);
    const parts = [...byType].map(([k, v]) => `${k} ${(v.f / v.t).toFixed(2)}`).join("  ");
    console.log(`  ${day}: forecast ${f.toFixed(0)} vs true ${t.toFixed(0)} (ratio ${(f / t).toFixed(2)})  ${parts}`);
  }
  const gym = MACHINES[0];
  const day = addDays(today, 1);
  console.log(`\n${gym.id} on ${day} (machine true total ${machineDailyUnits(gym, day).toFixed(0)}):`);
  for (const s of slotsFor(gym).slice(0, 6)) {
    console.log(`  ${s.code} ${s.productId.padEnd(16)} forecast ${expectedUnits(baseline, s.id, day, day).toFixed(1).padStart(5)}  true ${expectedSlotDemand(gym, slotsFor(gym), s, day).toFixed(1).padStart(5)}`);
  }
}

main().finally(() => db.$disconnect());
