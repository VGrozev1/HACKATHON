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
  type PurchaseOrder,
  type Suggestion,
} from "./tools.ts";
import { getYesterdaysMisses, formatMisses } from "./misses.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const systemPrompt = readFileSync(path.join(here, "prompt.md"), "utf-8");

export type ToolStep = {
  step: number;
  tool: string;
  input: unknown;
  output: unknown;
  isError: boolean;
};

export type RunResult = {
  date: string;
  summary: string;
  orders: PurchaseOrder[];
  suggestions: Suggestion[];
  steps: ToolStep[];
};

const MAX_STEPS = 25;

export async function runNight(
  date: string,
  onStep?: (step: ToolStep) => void,
): Promise<RunResult> {
  const client = new Anthropic();

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
  }

  const orders = purchaseOrders.slice(ordersStartIndex);
  const suggestionsThisRun = suggestions.slice(suggestionsStartIndex);
  const run: RunResult = { date, summary, orders, suggestions: suggestionsThisRun, steps };

  await saveRun(run);

  return run;
}

async function saveRun(run: RunResult): Promise<string> {
  const runsDir = path.join(here, "runs");
  await mkdir(runsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = path.join(runsDir, `${run.date}_${timestamp}.json`);
  await writeFile(filePath, JSON.stringify(run, null, 2));
  return filePath;
}

// When this file is run directly (not imported), do tonight's run.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const tonight = new Date().toISOString().slice(0, 10);

  const run = await runNight(tonight, (step) => {
    console.log(
      `[step ${step.step}]${step.isError ? " ERROR" : ""} ${step.tool}(${JSON.stringify(step.input)})`,
    );
    console.log(`  -> ${JSON.stringify(step.output)}`);
  });

  console.log("\n=== Summary ===\n");
  console.log(run.summary);
}
