// GET /api/holidays?days=7 — Bulgarian public holidays from tomorrow on (simulated calendar).
import type { NextRequest } from "next/server";
import { getSimToday } from "@/lib/data/sim-clock";
import { addDays, holidayOn } from "@/lib/sim/calendar";

export async function GET(req: NextRequest) {
  const days = Number(req.nextUrl.searchParams.get("days") ?? 7);
  if (!Number.isInteger(days) || days < 1 || days > 60) return Response.json({ error: "days must be a whole number from 1 to 60" }, { status: 400 });
  const today = await getSimToday();
  return Response.json(
    Array.from({ length: days }, (_, i) => addDays(today, i + 1))
      .filter((d) => holidayOn(d))
      .map((date) => ({ date, name: holidayOn(date) })),
  );
}
