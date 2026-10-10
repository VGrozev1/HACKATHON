// GET /api/benchmark — agent vs fixed weekly order on the same demand (A8, the "one number"). Stub.
import { connection } from "next/server";
import { mockBenchmark } from "@/mocks";

export async function GET() {
  await connection(); // always run at request time, never prerender at build (live data)
  return Response.json(mockBenchmark);
}
