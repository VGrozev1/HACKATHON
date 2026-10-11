// Agent runs in the database (AgentRun), so run night works on Vercel: the
// run-night route stores each step as the agent produces it, and the dashboard
// polls GET /api/agent/runs/:id from whichever server instance answers.

import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { AgentDecision, AgentRun, AgentStep } from "@/lib/api-types";

/** One tool call as Viktor's runNight() reports it through onStep. */
export interface ToolStep {
  step: number;
  at: string;
  tool: string;
  input: unknown;
  output: unknown;
  isError: boolean;
}

/** Longer than any run can last (the route's maxDuration is 300 s). */
const STALE_AFTER_MS = 6 * 60_000;

export async function createRun(runDate: string): Promise<string> {
  const run = await db.agentRun.create({
    data: { runDate: new Date(`${runDate}T00:00:00Z`), status: "RUNNING", simulated: false, steps: [], decisions: [] },
  });
  return run.id;
}

/**
 * Appends steps one write at a time (onStep fires without waiting), so two
 * quick steps never overwrite each other. `flush()` waits for pending writes.
 */
export function stepRecorder(runId: string) {
  let chain: Promise<unknown> = Promise.resolve();
  const steps: ToolStep[] = [];
  return {
    record(step: ToolStep) {
      steps.push(step);
      const snapshot = JSON.parse(JSON.stringify(steps)) as Prisma.InputJsonArray;
      chain = chain
        .then(() => db.agentRun.update({ where: { id: runId }, data: { steps: snapshot } }))
        .catch((e) => console.error(`[agent-runs] saving step for ${runId} failed:`, e));
    },
    flush: () => chain,
  };
}

type RunResultLike = {
  summary?: string;
  orders?: { id?: string; supplier?: string; reason?: string; totalEur?: number; status?: string }[];
  suggestions?: { id?: string; machineId?: string; suggestion?: string; reason?: string; status?: string }[];
};

export async function finishRun(runId: string, result: RunResultLike) {
  const decisions: AgentDecision[] = [
    ...(result.orders ?? []).map((o) => ({
      kind: "order" as const,
      refId: o.id,
      summary: `Order to ${o.supplier ?? "supplier"}: €${(o.totalEur ?? 0).toFixed(2)}${o.status ? ` (${o.status})` : ""}`,
      reason: o.reason ?? "",
    })),
    ...(result.suggestions ?? []).map((s) => ({
      kind: "alert" as const,
      refId: s.id,
      summary: s.suggestion ?? "Suggestion",
      reason: s.reason ?? "",
    })),
  ];
  await db.agentRun.update({
    where: { id: runId },
    data: {
      status: "SUCCEEDED",
      explanation: result.summary || null,
      decisions: JSON.parse(JSON.stringify(decisions)) as Prisma.InputJsonArray,
      finishedAt: new Date(),
    },
  });
}

export async function failRun(runId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  await db.agentRun.update({
    where: { id: runId },
    data: { status: "FAILED", explanation: `The agent stopped: ${message}`, finishedAt: new Date() },
  });
}

/**
 * The run in the dashboard's shape. Steps from runNight() ({ step, tool, input,
 * output, isError }) become one tool_call each: src/lib/api.ts's fromStep()
 * expands it into a call card plus a result card. Steps already in AgentStep
 * form (fast-forward's nights) pass through.
 */
export async function getRunDto(id: string): Promise<AgentRun | null> {
  const run = await db.agentRun.findUnique({ where: { id } });
  if (!run) return null;

  const stale = run.status === "RUNNING" && Date.now() - run.startedAt.getTime() > STALE_AFTER_MS;
  const raw = (run.steps as unknown as (ToolStep | AgentStep)[]) ?? [];
  const steps: AgentStep[] = raw.map((s) =>
    "isError" in s ? { at: s.at, type: "tool_call" as const, tool: s.tool, input: s.input, output: s.output } : s,
  );
  return {
    id: run.id,
    runDate: run.runDate.toISOString().slice(0, 10),
    status: stale ? "FAILED" : run.status,
    steps,
    decisions: (run.decisions as unknown as AgentDecision[]) ?? [],
    explanation: stale ? "The run took longer than the server allows and was stopped." : run.explanation,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
  };
}
