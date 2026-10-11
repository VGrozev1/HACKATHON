// POST /api/agent/run-night — run one night of Viktor's agent (B1) inside this
// request, so it works on Vercel as well as locally. Answers at once (202) with
// a run id; the agent keeps working after the response (`after`, up to
// maxDuration) and every step is stored in the database (AgentRun), which
// GET /api/agent/runs/:id reads for the dashboard's live view.
import { after, type NextRequest } from "next/server";
import type { RunNightResponse } from "@/lib/api-types";
import { createRun, failRun, finishRun, stepRecorder, type ToolStep } from "@/lib/data/agent-runs";
import { getSimToday } from "@/lib/data/sim-clock";

// A night is up to 25 Claude calls; Vercel stops the function at this limit.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const runDate = await getSimToday();
  const runId = await createRun(runDate);

  // The agent's tools call this app's API over HTTP (agent/api.ts reads
  // APP_URL on every call): point them at the address this request came in on,
  // so it works on localhost and on the deployed site alike.
  process.env.APP_URL = req.nextUrl.origin;

  after(async () => {
    const steps = stepRecorder(runId);
    try {
      // Loaded here, not at the top, so a problem inside the agent fails this
      // run (shown on the dashboard) instead of the whole route.
      const { runNight } = await import("../../../../../agent/agent.ts");
      const result = await runNight(runDate, (step: ToolStep) => steps.record(step));
      await steps.flush();
      await finishRun(runId, result);
    } catch (err) {
      await steps.flush();
      console.error(`[run-night] ${runId} failed:`, err);
      await failRun(runId, err);
    }
  });

  const body: RunNightResponse = { runId };
  return Response.json(body, { status: 202 });
}
