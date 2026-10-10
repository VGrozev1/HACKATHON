// GET /api/machines — fleet overview with stock, today's sales and alerts (A6).
import { connection } from "next/server";
import { listMachines } from "@/lib/data/fleet";

export async function GET() {
  await connection(); // live data: never prerender at build
  return Response.json(await listMachines());
}
