// POST /api/agent/run-night — start one night of the agent (B1). Returns at once
// with a run id; poll GET /api/agent/runs/:id for steps. Stub until B1.
import { mockAgentRun } from "@/mocks";
import type { RunNightResponse } from "@/lib/api-types";

export async function POST() {
  const body: RunNightResponse = { runId: mockAgentRun.id };
  return Response.json(body, { status: 202 });
}
