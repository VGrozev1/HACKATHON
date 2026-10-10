// GET /api/visits?date=YYYY-MM-DD — the stocker's route for a day, in order (A6).
// Without a date: the next day that has visits planned.
import type { NextRequest } from "next/server";
import { listVisits } from "@/lib/data/fleet";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") ?? undefined;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  return Response.json(await listVisits(date));
}
