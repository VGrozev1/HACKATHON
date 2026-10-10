// GET /api/machines — fleet overview (C2). Stub: replace with real query in A6.
import { connection } from "next/server";
import { mockMachines } from "@/mocks";

export async function GET() {
  await connection(); // always run at request time, never prerender at build (live data)
  return Response.json(mockMachines);
}
