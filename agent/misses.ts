import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RunResult } from "./agent.ts";
import { apiGet } from "./api.ts";

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

type ForecastStepOutput = {
  machine_id: string;
  from: string; // the day forecast() projected from — what "actual" means here
  forecast: { product: string; avgDailySales: number }[];
};

async function actualUnitsSold(machineId: string, date: string): Promise<Map<string, number>> {
  const res = await apiGet<{ products: { product: string; units: number }[] }>(
    `/api/machines/${encodeURIComponent(machineId)}/sales/products?date=${date}`,
  );
  return new Map(res.products.map((p) => [p.product, p.units]));
}

// Reads the previous run's forecast() calls and compares each product's
// forecast rate against what actually sold on the day it was forecasting,
// returning the 3 biggest misses (by absolute size). Skips a machine
// gracefully if its actuals can't be fetched — this is a "nice to have"
// correction, not worth failing the whole run over.
export async function getYesterdaysMisses(before: Date): Promise<Miss[]> {
  const previousFile = await findPreviousRunFile(before);
  if (!previousFile) return [];

  const content = await readFile(previousFile, "utf-8");
  const previousRun = JSON.parse(content) as RunResult;

  const misses: Miss[] = [];
  for (const step of previousRun.steps) {
    if (step.tool !== "forecast" || step.isError) continue;
    const output = step.output as ForecastStepOutput;
    if (!output?.from || !Array.isArray(output.forecast)) continue;

    let sold: Map<string, number>;
    try {
      sold = await actualUnitsSold(output.machine_id, output.from);
    } catch (err) {
      console.error(`Could not fetch actual sales for ${output.machine_id} on ${output.from}:`, err);
      continue;
    }

    for (const line of output.forecast) {
      const actual = sold.get(line.product) ?? 0;
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
