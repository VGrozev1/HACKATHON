// POST /api/sim/fast-forward?days=7 — simulate N days with the agent (A7). Stub.
import type { NextRequest } from "next/server";
import { mockAgentRun, mockBenchmark } from "@/mocks";
import type { FastForwardResponse } from "@/lib/api-types";

export async function POST(req: NextRequest) {
  const days = Number(req.nextUrl.searchParams.get("days") ?? 7);
  const body: FastForwardResponse = {
    daysSimulated: days,
    runIds: Array.from({ length: days }, (_, i) => `${mockAgentRun.id}_${i + 1}`),
    benchmark: mockBenchmark,
  };
  return Response.json(body);
}
