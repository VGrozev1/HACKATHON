// GET /api/health — is the app up, and can it reach the database? `today`
// is the simulated day (SimState.today, not the real date — see
// sim-clock.ts); Viktor's agent reads it so its weather/holiday reasoning
// matches the same simulated world the demand numbers come from, instead
// of the real calendar date.
import { db } from "@/lib/db";
import { getSimToday } from "@/lib/data/sim-clock";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, db: "up", today: await getSimToday() });
  } catch {
    return Response.json({ ok: true, db: "down" }, { status: 503 });
  }
}
