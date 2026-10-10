// GET /api/agent/runs/:id — a run with its steps so far (C4 polls this ~every second). Stub: B1.
import type { NextRequest } from "next/server";
import { mockAgentRun } from "@/mocks";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/agent/runs/[id]">) {
  const { id } = await ctx.params;
  return Response.json({ ...mockAgentRun, id });
}
