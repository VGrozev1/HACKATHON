import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  tools,
  runTool,
  purchaseOrders,
  suggestions,
  getSimToday,
  type PurchaseOrder,
  type Suggestion,
} from "./tools.ts";
import { getYesterdaysMisses, formatMisses } from "./misses.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const systemPrompt = readFileSync(path.join(here, "prompt.md"), "utf-8");

export type ToolStep = {
  step: number;
  at: string;
  tool: string;
  input: unknown;
  output: unknown;
  isError: boolean;
};

export type RunResult = {
  date: string;
  status: "RUNNING" | "SUCCEEDED" | "FAILED";
  startedAt: string;
  finishedAt: string | null;
  summary: string;
  orders: PurchaseOrder[];
  suggestions: Suggestion[];
  steps: ToolStep[];
};

const MAX_STEPS = 25;

// Set by whoever starts a run (e.g. the dashboard's run-night route) so it can
// find this run's file by a known id instead of guessing a timestamp. Falls
// back to a plain date-based name when run straight from the command line.
const runId = process.env.AGENT_RUN_ID;

export async function runNight(
  date: string,
  onStep?: (step: ToolStep) => void,
): Promise<RunResult> {
  const client = new Anthropic();
  const startedAt = new Date().toISOString();

  const misses = await getYesterdaysMisses(new Date());
  const missesText = formatMisses(misses);
  const firstMessage = missesText
    ? `Run the nightly restocking routine for ${date}.\n\n${missesText}`
    : `Run the nightly restocking routine for ${date}.`;

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: firstMessage }];

  const steps: ToolStep[] = [];
  let toolCallCount = 0;
  const ordersStartIndex = purchaseOrders.length;
  const suggestionsStartIndex = suggestions.length;

  let summary = "";
  let step = 0;

  // Rebuilt and written to disk after every tool call (status RUNNING), so a
  // caller polling the run file from outside this process (e.g. the
  // dashboard's run-night route) can show live progress, not just the final
  // result.
  const snapshot = (status: RunResult["status"], finishedAt: string | null): RunResult => ({
    date,
    status,
    startedAt,
    finishedAt,
    summary,
    orders: purchaseOrders.slice(ordersStartIndex),
    suggestions: suggestions.slice(suggestionsStartIndex),
    steps,
  });

  try {
    while (true) {
      step++;
      if (step > MAX_STEPS) {
        summary = `Stopped after ${MAX_STEPS} steps without finishing.`;
        break;
      }

      const response = await client.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 4096,
        system: systemPrompt,
        tools,
        messages,
      });

      messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason !== "tool_use") {
        const textParts: string[] = [];
        for (const block of response.content) {
          if (block.type === "text") {
            textParts.push(block.text);
          }
        }
        summary = textParts.join("\n");
        break;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        toolCallCount++;
        let output: unknown;
        let isError = false;
        try {
          output = await runTool(block.name, block.input);
        } catch (err) {
          // A tool throwing is a bug in the tool, not a reason to crash the
          // whole night's run — turn it into a tool result Claude can read
          // and react to, same as any other error-shaped result.
          isError = true;
          output = { error: err instanceof Error ? err.message : String(err) };
        }

        const record: ToolStep = {
          step: toolCallCount,
          at: new Date().toISOString(),
          tool: block.name,
          input: block.input,
          output,
          isError,
        };
        steps.push(record);
        onStep?.(record);

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(output),
          is_error: isError,
        });
      }

      messages.push({ role: "user", content: toolResults });
      await saveRun(snapshot("RUNNING", null));
    }
  } catch (err) {
    summary = err instanceof Error ? err.message : String(err);
    await saveRun(snapshot("FAILED", new Date().toISOString()));
    throw err;
  }

  const run = snapshot("SUCCEEDED", new Date().toISOString());
  await saveRun(run);

  return run;
}

async function saveRun(run: RunResult): Promise<string> {
  const runsDir = path.join(here, "runs");
  await mkdir(runsDir, { recursive: true });

  const filePath = path.join(runsDir, `${runId ?? `${run.date}_${run.startedAt.replace(/[:.]/g, "-")}`}.json`);
  await writeFile(filePath, JSON.stringify(run, null, 2));
  return filePath;
}

// When this file is run directly (not imported), do tonight's run.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  // The simulated day (SimState.today), not the real calendar date — they
  // can drift apart once fast-forward has moved the sim clock on, and the
  // agent's own forecast/weather/holiday tools all reason in sim-day terms.
  const tonight = await getSimToday();

  const run = await runNight(tonight, (step) => {
    console.log(
      `[step ${step.step}]${step.isError ? " ERROR" : ""} ${step.tool}(${JSON.stringify(step.input)})`,
    );
    console.log(`  -> ${JSON.stringify(step.output)}`);
  });

  console.log("\n=== Summary ===\n");
  console.log(run.summary);
}
