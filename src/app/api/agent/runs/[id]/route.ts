// GET /api/agent/runs/:id — a run with its steps so far (C4 polls this ~every
// second). Reads agent/runs/<id>.json, written incrementally by `node
// agent.ts` (spawned from POST /api/agent/run-night) after every tool call.
//
// Known gap: orders and visits from a real run aren't written to this app's
// database, only to that JSON file — so the Orders/Route views the dashboard
// fetches after a run finishes (GET /api/orders, GET /api/visits) won't show
// them yet. The run's live steps and final explanation below are real.
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import type { AgentDecision, AgentRun, AgentStep } from "@/lib/api-types";

type AgentToolStep = {
  step: number;
  at: string;
  tool: string;
  input: unknown;
  output: unknown;
  isError: boolean;
};

type AgentRunFile = {
  date: string;
  status: "RUNNING" | "SUCCEEDED" | "FAILED";
  startedAt: string;
  finishedAt: string | null;
  summary: string;
  orders: { id: string; supplier: string; reason: string; totalEur: number }[];
  suggestions: unknown[];
  steps: AgentToolStep[];
};

function toAgentSteps(steps: AgentToolStep[]): AgentStep[] {
  return steps.flatMap((s) => [
    { at: s.at, type: "tool_call" as const, tool: s.tool, input: s.input },
    { at: s.at, type: s.isError ? ("error" as const) : ("tool_result" as const), tool: s.tool, output: s.output },
  ]);
}

function toDecisions(run: AgentRunFile): AgentDecision[] {
  return run.orders.map((o) => ({
    kind: "order" as const,
    refId: o.id,
    summary: `Order to ${o.supplier}: €${o.totalEur.toFixed(2)}`,
    reason: o.reason,
  }));
}

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/agent/runs/[id]">) {
  const { id } = await ctx.params;
  const filePath = path.join(process.cwd(), "agent", "runs", `${id}.json`);

  let run: AgentRunFile;
  try {
    run = JSON.parse(await readFile(filePath, "utf-8"));
  } catch {
    // The child process hasn't written its first snapshot yet — tell the
    // poller to keep waiting rather than erroring on a normal startup race.
    const startedAt = new Date().toISOString();
    const empty: AgentRun = { id, runDate: startedAt.slice(0, 10), status: "RUNNING", steps: [], decisions: [], explanation: null, startedAt, finishedAt: null };
    return Response.json(empty);
  }

  const body: AgentRun = {
    id,
    runDate: run.date,
    status: run.status,
    steps: toAgentSteps(run.steps),
    decisions: toDecisions(run),
    explanation: run.summary || null,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
  };
  return Response.json(body);
}
