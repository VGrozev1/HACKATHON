// POST /api/agent/run-night — start one night of Viktor's agent (B1) as a
// separate `node agent.ts` process (agent/ is its own project — see
// agent/CLAUDE.md — and isn't bundled into this app). Returns at once with a
// run id; GET /api/agent/runs/:id polls agent/runs/<runId>.json for progress.
//
// Only works where the Node process this app runs in can spawn and outlive a
// child process for the run's duration (a few minutes) — true for `next dev`
// and `next start` on a normal server, NOT guaranteed on Vercel's serverless
// functions, which may be torn down right after the response. Deploying this
// route as-is to Vercel needs a persistent runner instead; out of scope here.
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import type { RunNightResponse } from "@/lib/api-types";

export async function POST() {
  const runId = randomUUID();
  const agentDir = path.join(process.cwd(), "agent");

  // process.execPath (this Node binary) rather than the literal "node": the
  // bundler statically analyses spawn("node", [...]) and tries to bundle the
  // arguments as modules, which broke the build ("Can't resolve '--env-file=.env'").
  const child = spawn(process.execPath, ["--env-file=.env", "agent.ts"], {
    cwd: agentDir,
    env: { ...process.env, AGENT_RUN_ID: runId },
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  const body: RunNightResponse = { runId };
  return Response.json(body, { status: 202 });
}
