// GET /api/visits?date=YYYY-MM-DD — the stocker's route for a day, in order. Stub: A6.
import type { NextRequest } from "next/server";
import { mockVisits } from "@/mocks";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  return Response.json(date ? mockVisits.filter((v) => v.date === date) : mockVisits);
}
