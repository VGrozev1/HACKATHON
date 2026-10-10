// POST /api/sim/fast-forward?days=7 — simulate N days with the night planner (A7):
// each night it plans visits and orders, each day customers buy. Returns the run ids
// and the benchmark against the fixed weekly order on exactly those days (A8).
// Reset to the seeded state with `npm run db:seed`.
import type { NextRequest } from "next/server";
import { fastForward, MAX_FAST_FORWARD_DAYS } from "@/lib/data/fast-forward";

export const maxDuration = 120; // ~2–3 s per simulated day

export async function POST(req: NextRequest) {
  const days = Number(req.nextUrl.searchParams.get("days") ?? 7);
  if (!Number.isInteger(days) || days < 1 || days > MAX_FAST_FORWARD_DAYS) {
    return Response.json({ error: `days must be 1–${MAX_FAST_FORWARD_DAYS}` }, { status: 400 });
  }
  return Response.json(await fastForward({ days }));
}
