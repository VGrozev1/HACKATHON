import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RunResult } from "./agent.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const runsDir = path.join(here, "runs");

export type Miss = {
  machineId: string;
  product: string;
  forecast: number;
  actual: number;
  miss: number; // actual - forecast; positive = under-forecast
};

// Finds the most recent run file strictly older than `before`, so a run
// never matches its own (not-yet-written) file or a same-moment duplicate.
async function findPreviousRunFile(before: Date): Promise<string | null> {
  let entries: string[];
  try {
    entries = await readdir(runsDir);
  } catch {
    return null; // no runs/ directory yet
  }

  const jsonFiles = entries.filter((f) => f.endsWith(".json"));
  let best: { file: string; mtimeMs: number } | null = null;
  for (const file of jsonFiles) {
    const fullPath = path.join(runsDir, file);
    const stats = await stat(fullPath);
    if (stats.mtimeMs >= before.getTime()) continue;
    if (!best || stats.mtimeMs > best.mtimeMs) {
      best = { file: fullPath, mtimeMs: stats.mtimeMs };
    }
  }
  return best?.file ?? null;
}

// Stands in for actual per-product daily sales, which Todor's API doesn't
// expose yet (GET /api/machines/:id/sales only returns per-machine daily
// totals, not a per-product breakdown). Real sales vary day to day, so
// this applies a random swing around the forecast to make misses — and
// eventually, correcting them — possible to demo.
function simulateActualSales(forecastPerDay: number): number {
  const swing = 0.5 + Math.random() * 1.5; // 50%-200% of the average
  return Math.round(forecastPerDay * swing);
}

// Reads the previous run's forecast() calls, simulates what actually sold
// that day, and returns the 3 biggest misses (by absolute size).
export async function getYesterdaysMisses(before: Date): Promise<Miss[]> {
  const previousFile = await findPreviousRunFile(before);
  if (!previousFile) return [];

  const content = await readFile(previousFile, "utf-8");
  const previousRun = JSON.parse(content) as RunResult;

  const misses: Miss[] = [];
  for (const step of previousRun.steps) {
    if (step.tool !== "forecast" || step.isError) continue;
    const output = step.output as {
      machine_id: string;
      forecast: { product: string; avgDailySales: number }[];
    };
    for (const line of output.forecast) {
      const actual = simulateActualSales(line.avgDailySales);
      misses.push({
        machineId: output.machine_id,
        product: line.product,
        forecast: line.avgDailySales,
        actual,
        miss: actual - line.avgDailySales,
      });
    }
  }

  return misses.sort((a, b) => Math.abs(b.miss) - Math.abs(a.miss)).slice(0, 3);
}

export function formatMisses(misses: Miss[]): string {
  if (misses.length === 0) return "";

  const lines = misses.map((m) => {
    const direction = m.miss > 0 ? "under-forecast" : "over-forecast";
    return `- You ${direction} "${m.product}" at ${m.machineId} by ${Math.abs(m.miss)} units (forecast ${m.forecast}, sold ${m.actual}).`;
  });

  return `Yesterday's biggest forecast misses:\n${lines.join("\n")}`;
}
