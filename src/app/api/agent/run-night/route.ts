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
import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RunNightResponse } from "@/lib/api-types";

export async function POST() {
  const runId = randomUUID();
  const agentDir = path.join(process.cwd(), "agent");
  const runsDir = path.join(agentDir, "runs");
  await mkdir(runsDir, { recursive: true });
  const runFile = path.join(runsDir, `${runId}.json`);
  const logFile = path.join(runsDir, `${runId}.log`);
  const startedAt = new Date().toISOString();

  // The agent gets this app's environment (the root .env, already loaded by
  // Next.js), so no separate agent/.env is needed; one is still read if present.
  // process.execPath (this Node binary) rather than the literal "node": the
  // bundler statically analyses spawn("node", [...]) and tries to bundle the
  // arguments as modules, which broke the build ("Can't resolve '--env-file=.env'").
  const log = createWriteStream(logFile);
  const child = spawn(process.execPath, ["--env-file-if-exists=.env", "agent.ts"], {
    cwd: agentDir,
    env: { ...process.env, AGENT_RUN_ID: runId },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(log);
  child.stderr.pipe(log);

  // If the agent dies before it finishes (missing key, crash, no network),
  // mark the run FAILED with the reason, so the dashboard stops waiting.
  const markFailed = async (reason: string) => {
    let status: string | undefined;
    try {
      status = JSON.parse(await readFile(runFile, "utf-8")).status;
    } catch {
      // no snapshot written yet
    }
    if (status === "SUCCEEDED" || status === "FAILED") return;
    const tail = (await readFile(logFile, "utf-8").catch(() => "")).trim().split("\n").slice(-5).join("\n");
    await writeFile(
      runFile,
      JSON.stringify({
        date: startedAt.slice(0, 10),
        status: "FAILED",
        startedAt,
        finishedAt: new Date().toISOString(),
        summary: `The agent stopped: ${reason}${tail ? `\n${tail}` : ""}`,
        orders: [],
        suggestions: [],
        steps: [],
      }),
    );
  };
  child.on("error", (err) => void markFailed(err.message));
  child.on("exit", (code) => {
    if (code !== 0) void markFailed(`exit code ${code}`);
  });

  const body: RunNightResponse = { runId };
  return Response.json(body, { status: 202 });
}
