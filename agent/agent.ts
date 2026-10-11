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

// Next to this file when run with `node agent.ts`; when the Next.js app bundles
// the agent (run night on Vercel), this file's own location is a build folder,
// so fall back to <project>/agent/prompt.md (shipped via next.config.ts).
// (Fixed paths, not computed ones: the bundler can then ship just this file.)
function loadPrompt(): string {
  try {
    return readFileSync(new URL("./prompt.md", import.meta.url), "utf-8");
  } catch {
    return readFileSync(path.join(process.cwd(), "agent/prompt.md"), "utf-8");
  }
}
const systemPrompt = loadPrompt();

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
  let continuations = 0;

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

      // Streamed (the SDK requires it for replies this large), then read as one
      // complete message: the rest of the loop is unchanged.
      const response = await client.messages
        .stream({
          model: "claude-sonnet-5",
          // Room for one reply that asks for stock + forecast on all 20 machines
          // at once, plus its thinking.
          max_tokens: 32000,
          // Thinking is on by default at effort "high"; at that level planning
          // 20 machines used the whole reply on thinking and never called a
          // tool. "medium" thinks enough for a route and orders.
          output_config: { effort: "medium" },
          system: systemPrompt,
          tools,
          messages,
        })
        .finalMessage();

      messages.push({ role: "assistant", content: response.content });

      // Keep going while the reply asks for tools, even if it was cut off by
      // max_tokens: ending there left the night with no plan and no summary.
      const asksForTools = response.content.some((block) => block.type === "tool_use");
      if (!asksForTools) {
        // Ran out of room while still thinking: ask it to act, instead of
        // ending the night with no route, orders or summary (at most twice).
        if (response.stop_reason === "max_tokens" && continuations < 2) {
          continuations++;
          messages.push({
            role: "user",
            content:
              "You ran out of room while thinking. Continue the routine now: call the next tools directly and keep your reasoning short.",
          });
          continue;
        }
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

// The run file is a convenience for command-line runs. Where the disk is
// read-only (Vercel), the app stores each step in the database through
// onStep instead, so a failed write must never stop the night's run.
async function saveRun(run: RunResult): Promise<string | null> {
  try {
    const runsDir = path.join(here, "runs");
    await mkdir(runsDir, { recursive: true });

    const filePath = path.join(runsDir, `${runId ?? `${run.date}_${run.startedAt.replace(/[:.]/g, "-")}`}.json`);
    await writeFile(filePath, JSON.stringify(run, null, 2));
    return filePath;
  } catch {
    return null;
  }
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
