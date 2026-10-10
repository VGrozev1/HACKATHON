// GET /api/alerts — every machine's problems as flat facts (offline, zero sales,
// cash mismatch, stock-outs, expiring food). The agent explains likely causes.
import { connection } from "next/server";
import { db } from "@/lib/db";
import { fleetAlerts } from "@/lib/data/fleet";
import { getSimToday } from "@/lib/data/sim-clock";

export async function GET() {
  await connection();
  const [alerts, machines] = await Promise.all([fleetAlerts(await getSimToday()), db.machine.findMany({ select: { id: true, name: true } })]);
  const name = new Map(machines.map((m) => [m.id, m.name]));
  return Response.json(
    [...alerts].flatMap(([machineId, list]) =>
      list.map((a) => ({ machineId, machineName: name.get(machineId), kind: a.kind, message: a.message, likelyCause: a.likelyCause ?? null })),
    ),
  );
}
