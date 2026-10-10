// GET /api/today — the simulated date the app runs on (fast-forward moves it).
import { connection } from "next/server";
import { getSimToday } from "@/lib/data/sim-clock";
import { addDays } from "@/lib/sim/calendar";

export async function GET() {
  await connection();
  const today = await getSimToday();
  return Response.json({ today, tomorrow: addDays(today, 1) });
}
