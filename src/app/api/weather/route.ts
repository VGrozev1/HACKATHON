// GET /api/weather?days=3 — Sofia's forecast from tomorrow, from the same
// weather that drives the simulated sales (src/lib/sim/calendar.ts).
import type { NextRequest } from "next/server";
import { getSimToday } from "@/lib/data/sim-clock";
import { addDays, weatherOn } from "@/lib/sim/calendar";

export async function GET(req: NextRequest) {
  const days = Number(req.nextUrl.searchParams.get("days") ?? 3);
  if (!Number.isInteger(days) || days < 1 || days > 14) return Response.json({ error: "days must be a whole number from 1 to 14" }, { status: 400 });
  const today = await getSimToday();
  return Response.json(
    Array.from({ length: days }, (_, i) => {
      const date = addDays(today, i + 1);
      const w = weatherOn(date);
      // The simulation only knows rain or no rain; 5 mm stands for a rainy day.
      return { date, maxTempC: w.tMaxC, rainMm: w.rainy ? 5 : 0, note: w.note };
    }),
  );
}
