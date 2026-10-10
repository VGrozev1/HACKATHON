"use client";

// C6: "fast-forward a week". Runs the agent and a fixed weekly order on the same
// simulated demand, then shows the one number for the judges.

import { useEffect, useRef, useState } from "react";
import { CalendarDays, FastForward, RotateCcw, TrendingDown } from "lucide-react";
import type { BenchmarkResult } from "@/types";
import { fastForward, USE_MOCK } from "@/lib/api";
import { addDays, DEMO_NOW, dayKey, formatDate, formatEURRound } from "@/lib/format";
import { useCountUp } from "@/hooks/use-count-up";
import { cn } from "@/lib/utils";
import { PageHeader, Panel } from "@/components/page-header";
import { ErrorState } from "@/components/states";
import { ComparisonBarChart, DailyStockOutsChart } from "@/components/charts";
import { Button } from "@/components/ui/button";

const DAYS = 7;
type Phase = "idle" | "running" | "done" | "error";

const pctFewer = (agent: number, fixed: number) => (fixed > 0 ? Math.round(((fixed - agent) / fixed) * 100) : 0);

export function SimulationView() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [day, setDay] = useState(0);
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const token = useRef(0);

  // Step the visible day counter while the simulation runs; it waits on the last day until results arrive.
  useEffect(() => {
    if (phase !== "running") return;
    // The real simulation takes ~2–4 s per day (api.md, A7); the mock answers in about 4 s total.
    const t = setInterval(() => setDay((d) => Math.min(DAYS, d + 1)), USE_MOCK ? 550 : 3000);
    return () => clearInterval(t);
  }, [phase]);

  const run = () => {
    const my = ++token.current;
    setPhase("running");
    setDay(1);
    setResult(null);
    setError(null);
    fastForward(DAYS).then(
      (r) => {
        if (token.current !== my) return;
        setDay(DAYS);
        setResult(r);
        setPhase("done");
      },
      (e: unknown) => {
        if (token.current !== my) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setPhase("error");
      },
    );
  };

  const firstDay = addDays(dayKey(DEMO_NOW), 1);
  const currentDay = addDays(firstDay, Math.max(0, day - 1));

  return (
    <>
      <PageHeader
        title="Simulation"
        description="Fast-forward a week of sales. The agent and a fixed weekly order face exactly the same demand."
        actions={
          phase === "done" && (
            <Button size="lg" variant="outline" onClick={run} className="h-11 px-5 text-base">
              <RotateCcw /> Run again
            </Button>
          )
        }
      />

      {phase !== "done" && (
        <section className="rounded-2xl border bg-card p-10 text-center shadow-sm">
          <button
            type="button"
            onClick={run}
            disabled={phase === "running"}
            className="inline-flex items-center gap-4 rounded-2xl bg-primary px-10 py-5 text-2xl font-bold text-primary-foreground shadow-[0_12px_40px_-8px] shadow-primary/50 transition-all hover:scale-[1.02] focus-visible:ring-4 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-wait disabled:hover:scale-100"
          >
            <FastForward className={cn("size-8", phase === "running" && "animate-pulse")} />
            {phase === "running" ? "Simulating…" : "Fast-forward a week"}
          </button>

          {phase === "running" ? (
            <div className="mx-auto mt-10 max-w-2xl">
              <div className="mb-3 flex items-center justify-between text-lg font-semibold">
                <span className="inline-flex items-center gap-2">
                  <CalendarDays className="size-5 text-primary" /> {formatDate(currentDay)}
                </span>
                <span className="tabular-nums">
                  Day {day}/{DAYS}
                </span>
              </div>
              <div className="flex gap-1.5">
                {Array.from({ length: DAYS }, (_, i) => (
                  <div key={i} className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className={cn("h-full rounded-full bg-primary transition-all duration-500", i < day ? "w-full" : "w-0")} />
                  </div>
                ))}
              </div>
              <p className="mt-4 text-base text-muted-foreground">
                Each night the agent plans orders and routes; the stocker&apos;s loads are applied; the next day&apos;s sales are generated.
              </p>
            </div>
          ) : phase === "error" && error ? (
            <ErrorState error={error} onRetry={run} className="mx-auto mt-8 max-w-xl" />
          ) : (
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              Simulates {formatDate(firstDay)} to {formatDate(addDays(firstDay, DAYS - 1))}: about 9,000 sales across 20 machines,
              planned twice: once by the agent, once by the same order every Monday.
            </p>
          )}
        </section>
      )}

      {phase === "done" && result && <Results result={result} />}
    </>
  );
}

function Results({ result }: { result: BenchmarkResult }) {
  const stockOutPct = pctFewer(result.agent.stockOuts, result.fixedOrder.stockOuts);
  const wastePct = pctFewer(result.agent.expiredProducts, result.fixedOrder.expiredProducts);
  const shown = useCountUp(stockOutPct, 1600);
  const hasRevenue = result.agent.revenue > 0 || result.fixedOrder.revenue > 0;

  return (
    <div className="animate-step-in space-y-6">
      <section className="relative overflow-hidden rounded-2xl bg-sidebar p-10 text-white shadow-lg">
        <div className="absolute -top-24 -right-24 size-80 rounded-full bg-sidebar-primary/20 blur-3xl" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div>
            <p className="text-lg font-semibold text-sidebar-primary">After {result.days} simulated days</p>
            <p className="mt-2 flex items-baseline gap-4">
              <span className="text-8xl font-black tracking-tight tabular-nums lg:text-9xl">{Math.round(shown)}%</span>
              <TrendingDown className="size-14 text-sidebar-primary" aria-hidden />
            </p>
            <p className="mt-2 text-3xl font-semibold">fewer stock-outs than a fixed weekly order</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <BigFigure label="Less waste" value={`${wastePct}%`} sub={`${result.agent.expiredProducts} vs ${result.fixedOrder.expiredProducts} expired`} />
            <BigFigure label="Stock-outs" value={`${result.agent.stockOuts} vs ${result.fixedOrder.stockOuts}`} sub="agent vs fixed order" />
            {hasRevenue && (
              <BigFigure
                label="Extra revenue"
                value={`+${formatEURRound(result.agent.revenue - result.fixedOrder.revenue)}`}
                sub={`${formatEURRound(result.agent.revenue)} vs ${formatEURRound(result.fixedOrder.revenue)}`}
                className="sm:col-span-2"
              />
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Agent vs fixed weekly order" description="Totals over the simulated week. Lower is better.">
          <ComparisonBarChart
            data={[
              { metric: "Stock-outs", agent: result.agent.stockOuts, fixed: result.fixedOrder.stockOuts },
              { metric: "Expired products", agent: result.agent.expiredProducts, fixed: result.fixedOrder.expiredProducts },
            ]}
          />
        </Panel>
        <Panel title="Stock-outs per day" description="The fixed order runs dry as the week goes on; the agent reorders in time.">
          <DailyStockOutsChart data={result.daily} />
        </Panel>
      </div>
    </div>
  );
}

function BigFigure({ label, value, sub, className }: { label: string; value: string; sub: string; className?: string }) {
  return (
    <div className={cn("rounded-xl bg-white/10 px-5 py-4", className)}>
      <div className="text-sm font-semibold text-white/70">{label}</div>
      <div className="text-4xl font-bold tabular-nums">{value}</div>
      <div className="text-sm text-white/70">{sub}</div>
    </div>
  );
}
