"use client";

// C4: "run night", the centre of the demo. One big button; the agent's steps stream in
// live on the left; when it finishes, orders, route and decisions fill the right.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Brain,
  CircleCheck,
  CornerDownRight,
  Hash,
  Lightbulb,
  MapPin,
  Play,
  RotateCcw,
  Route as RouteIcon,
  ShieldAlert,
  Sparkles,
  Timer,
  Truck,
  Wrench,
} from "lucide-react";
import type { AgentRun, AgentStep, Visit } from "@/types";
import { getMachines, runNight } from "@/lib/api";
import { DEMO_NOW, formatDate, formatEUR, formatTimeSec } from "@/lib/format";
import { useAsync } from "@/hooks/use-async";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/states";
import { OrderStatusBadge } from "@/components/status";
import { RouteMap } from "@/components/maps";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Phase = "idle" | "running" | "done" | "error";

export function RunNight() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [finishedAt, setFinishedAt] = useState(0);
  const runToken = useRef(0);

  const start = () => {
    const token = ++runToken.current;
    setPhase("running");
    setSteps([]);
    setRun(null);
    setError(null);
    setStartedAt(Date.now());
    setFinishedAt(0);
    runNight((s) => {
      if (runToken.current === token) setSteps((prev) => [...prev, s]);
    }).then(
      (result) => {
        if (runToken.current !== token) return;
        setRun(result);
        setFinishedAt(Date.now());
        setPhase("done");
      },
      (e: unknown) => {
        if (runToken.current !== token) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setFinishedAt(Date.now());
        setPhase("error");
      },
    );
  };

  const reset = () => {
    runToken.current++;
    setPhase("idle");
    setSteps([]);
    setRun(null);
    setError(null);
  };

  if (phase === "idle") return <Intro onStart={start} />;

  return (
    <>
      <RunProgress steps={steps.length} phase={phase} />
      {phase === "done" && run && <SuccessBurst key={run.id + finishedAt} />}
      <PageHeader
        title="Tonight's agent run"
        description={`Planning the night of ${formatDate(DEMO_NOW)}: stock, forecast, orders and the stocker's route.`}
        actions={
          phase !== "running" && (
            <Button size="lg" variant="outline" onClick={reset} className="h-11 px-5 text-base">
              <RotateCcw /> Run again
            </Button>
          )
        }
      />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Timeline steps={steps} phase={phase} startedAt={startedAt} finishedAt={finishedAt} />
        <div className="min-w-0">
          {phase === "error" && error ? (
            <ErrorState error={error} onRetry={start} />
          ) : run ? (
            <Results run={run} />
          ) : (
            <ResultsPlaceholder />
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Thin bar along the top of the window. The real agent's step count isn't known up front,
 * so progress eases towards 95% as steps arrive and jumps to 100% when the run ends.
 */
function RunProgress({ steps, phase }: { steps: number; phase: Phase }) {
  const pct = phase === "running" ? Math.min(95, (1 - Math.exp(-steps / 9)) * 100) : 100;
  const done = phase !== "running";
  return (
    <div className="fixed inset-x-0 top-0 z-50 h-1.5 bg-transparent print:hidden" aria-hidden>
      <div
        className={cn(
          "h-full transition-[width,opacity] duration-700 ease-out",
          phase === "error" ? "bg-crit" : "bg-primary",
          done && "opacity-0 delay-1000",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** A short "night planned" moment when the run finishes; it fades out on its own. */
function SuccessBurst() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 1800);
    return () => clearTimeout(t);
  }, []);
  if (!visible) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center print:hidden" role="status">
      <div className="animate-success flex flex-col items-center gap-3 rounded-3xl border bg-card/95 px-12 py-9 shadow-2xl">
        <span className="relative grid size-20 place-items-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-ok/30 [animation-iteration-count:2]" />
          <span className="relative grid size-20 place-items-center rounded-full bg-ok text-white">
            <CircleCheck className="size-11" strokeWidth={2.5} />
          </span>
        </span>
        <p className="text-2xl font-bold">Night planned</p>
        <p className="text-base text-muted-foreground">Orders sent, route on its way to Telegram</p>
      </div>
    </div>
  );
}

function Intro({ onStart }: { onStart: () => void }) {
  const tasks = [
    { icon: <Wrench />, text: "Reads stock and sales for all 20 machines" },
    { icon: <Brain />, text: "Forecasts demand, adjusting for weather and holidays" },
    { icon: <Truck />, text: "Orders from suppliers within the €300 guardrail" },
    { icon: <RouteIcon />, text: "Plans the route and sends load lists to Telegram" },
  ];
  return (
    <div className="flex min-h-[calc(100vh-10rem)] flex-col items-center justify-center text-center">
      <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-base font-semibold text-accent-foreground">
        <Sparkles className="size-4" /> Every night at 22:00
      </span>
      <h1 className="max-w-3xl text-4xl font-bold tracking-tight lg:text-5xl">Let the agent plan tomorrow</h1>
      <p className="mt-4 max-w-2xl text-xl text-muted-foreground">
        One click runs the night: it checks the fleet, decides what to order and where the stocker goes, and explains every
        decision in plain language.
      </p>
      <button
        type="button"
        onClick={onStart}
        className="group mt-10 inline-flex items-center gap-4 rounded-2xl bg-primary px-10 py-6 text-2xl font-bold text-primary-foreground shadow-[0_12px_40px_-8px] shadow-primary/50 transition-all hover:scale-[1.02] hover:shadow-[0_16px_48px_-8px] hover:shadow-primary/60 focus-visible:ring-4 focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.99] lg:text-3xl"
      >
        <span className="grid size-12 place-items-center rounded-full bg-white/20 transition-transform group-hover:scale-110">
          <Play className="size-6 fill-current" />
        </span>
        Run tonight&apos;s agent
      </button>
      <ul className="mt-14 grid max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tasks.map((t) => (
          <li key={t.text} className="flex flex-col items-center gap-2 rounded-2xl border bg-card p-5 text-base shadow-sm">
            <span className="text-primary [&_svg]:size-6">{t.icon}</span>
            {t.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Live timeline ───────────────────────────────────────────────────────────

function Timeline({
  steps,
  phase,
  startedAt,
  finishedAt,
}: {
  steps: AgentStep[];
  phase: Phase;
  startedAt: number;
  finishedAt: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (phase !== "running") return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [steps.length]);

  const elapsed = ((finishedAt || now) - startedAt) / 1000;

  return (
    <section className="flex max-h-[calc(100vh-13rem)] min-h-[520px] flex-col overflow-hidden rounded-2xl border bg-card shadow-sm xl:sticky xl:top-24">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-6 py-4">
        <div className="flex items-center gap-2.5">
          {phase === "running" ? (
            <span className="relative flex size-3">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-70" />
              <span className="relative inline-flex size-3 rounded-full bg-primary" />
            </span>
          ) : (
            <CircleCheck className={cn("size-5", phase === "error" ? "text-crit" : "text-ok")} />
          )}
          <h2 className="text-lg font-semibold whitespace-nowrap">{phase === "running" ? "Agent working…" : phase === "error" ? "Run stopped" : "Run complete"}</h2>
        </div>
        <div className="flex items-center gap-4 text-base font-semibold whitespace-nowrap tabular-nums">
          <span className="inline-flex items-center gap-1.5" title="Steps">
            <Hash className="size-4 text-muted-foreground" /> {steps.length} steps
          </span>
          <span className="inline-flex items-center gap-1.5" title="Elapsed">
            <Timer className="size-4 text-muted-foreground" /> {elapsed.toFixed(1)} s
          </span>
        </div>
      </div>

      <ol className="flex-1 space-y-3 overflow-y-auto px-6 py-5" aria-live="polite">
        {steps.map((s, i) => (
          <StepItem key={s.id} step={s} active={phase === "running" && i === steps.length - 1} />
        ))}
        {phase === "running" && (
          <li className="flex items-center gap-3 pl-1 text-base text-muted-foreground">
            <span className="flex gap-1">
              {[0, 150, 300].map((d) => (
                <span key={d} className="size-2 animate-bounce rounded-full bg-primary/70" style={{ animationDelay: `${d}ms` }} />
              ))}
            </span>
            Thinking
          </li>
        )}
        <div ref={endRef} />
      </ol>
    </section>
  );
}

/**
 * Reveals text letter by letter while `animate` is on, so the newest step reads like the
 * agent typing it. Finishes within ~0.5 s and snaps to full text once the next step arrives.
 */
function Typed({ text, animate }: { text: string; animate: boolean }) {
  const [shown, setShown] = useState(animate ? 0 : text.length);
  useEffect(() => {
    if (!animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const start = performance.now();
    const duration = Math.min(550, text.length * 14);
    let frame = requestAnimationFrame(function tick(now) {
      const n = Math.ceil((Math.min(1, (now - start) / duration)) * text.length);
      setShown(n);
      if (n < text.length) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [animate, text]);
  if (!animate || shown >= text.length) return <>{text}</>;
  return (
    <>
      {text.slice(0, shown)}
      <span className="ml-0.5 inline-block h-[1em] w-0.5 translate-y-0.5 animate-pulse bg-current" aria-hidden />
      {/* Keep the final text in the layout so lines don't jump while typing. */}
      <span className="invisible">{text.slice(shown)}</span>
    </>
  );
}

/** The icon of the step the agent is on right now pulses, with a soft ring. */
function StepIcon({ active, className, children }: { active: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("relative grid shrink-0 place-items-center", className)}>
      {active && <span className="absolute inset-0 animate-ping rounded-[inherit] bg-current opacity-20" aria-hidden />}
      <span className={cn("relative grid place-items-center", active && "animate-pulse")}>{children}</span>
    </span>
  );
}

function StepItem({ step, active }: { step: AgentStep; active: boolean }) {
  const time = <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{formatTimeSec(step.timestamp)}</span>;

  if (step.type === "decision" || step.type === "guardrail" || step.type === "done") {
    const style = {
      decision: { box: "border-primary/40 bg-accent", icon: <Lightbulb />, iconClass: "text-primary", label: "Decision", labelClass: "text-primary" },
      guardrail: { box: "border-warn bg-warn-soft", icon: <ShieldAlert />, iconClass: "text-warn-strong", label: "Guardrail", labelClass: "text-warn-strong" },
      done: { box: "border-ok/50 bg-ok-soft", icon: <CircleCheck />, iconClass: "text-ok", label: "Done", labelClass: "text-ok" },
    }[step.type];
    return (
      <li className={cn("animate-step-in flex gap-3 rounded-xl border-2 p-4", style.box)}>
        <StepIcon active={active} className={cn("mt-0.5 size-7 rounded-full [&_svg]:size-6", style.iconClass)}>
          {style.icon}
        </StepIcon>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className={cn("text-xs font-bold tracking-wider uppercase", style.labelClass)}>{style.label}</span>
            {time}
          </div>
          <p className="mt-0.5 text-lg leading-snug font-semibold">
            <Typed text={step.title} animate={active} />
          </p>
          {step.detail && <p className="mt-1 text-base text-muted-foreground">{step.detail}</p>}
        </div>
      </li>
    );
  }

  if (step.type === "tool_call") {
    return (
      <li className="animate-step-in flex gap-3">
        <StepIcon active={active} className="size-8 rounded-lg bg-primary/10 text-primary">
          <Wrench className="size-4" />
        </StepIcon>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <code className="rounded-md bg-foreground px-2 py-0.5 font-mono text-sm font-semibold text-background">{step.tool}()</code>
            {time}
          </div>
          {step.detail && (
            <p className="mt-1 font-mono text-sm text-muted-foreground">
              <Typed text={step.detail} animate={active} />
            </p>
          )}
        </div>
      </li>
    );
  }

  if (step.type === "tool_result") {
    return (
      <li className="animate-step-in flex gap-3 pl-6">
        <StepIcon active={active} className="mt-1 size-5 rounded-full text-muted-foreground">
          <CornerDownRight className="size-5" />
        </StepIcon>
        <div className="min-w-0 flex-1 rounded-lg bg-muted px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-base font-semibold">
              <Typed text={step.title} animate={active} />
            </p>
            {time}
          </div>
          {step.detail && <p className="mt-0.5 text-sm text-muted-foreground">{step.detail}</p>}
        </div>
      </li>
    );
  }

  // thinking
  return (
    <li className="animate-step-in flex gap-3">
      <StepIcon active={active} className="size-8 rounded-lg bg-muted text-muted-foreground">
        <Brain className="size-4" />
      </StepIcon>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-base font-medium">
            <Typed text={step.title} animate={active} />
          </p>
          {time}
        </div>
        {step.detail && <p className="mt-0.5 text-base text-muted-foreground italic">{step.detail}</p>}
      </div>
    </li>
  );
}

// ─── Results ─────────────────────────────────────────────────────────────────

function ResultsPlaceholder() {
  return (
    <div className="space-y-4 rounded-2xl border border-dashed p-6">
      <p className="text-lg font-medium text-muted-foreground">Orders, route and decisions appear here when the agent finishes.</p>
      <Skeleton className="h-24 rounded-xl" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
      <Skeleton className="h-40 rounded-xl" />
    </div>
  );
}

function Results({ run }: { run: AgentRun }) {
  const total = run.orders.reduce((s, o) => s + o.total, 0);
  const waiting = run.orders.filter((o) => o.status === "waiting_for_approval").length;
  const decisions = run.steps.filter((s) => s.type === "decision" || s.type === "guardrail");

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-10 duration-500 ease-out [animation-delay:300ms] [animation-fill-mode:both]">
      <section className="rounded-2xl border-2 border-primary/30 bg-card p-6 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold tracking-wider text-primary uppercase">
          <Sparkles className="size-4" /> Agent summary
        </div>
        <p className="text-lg leading-relaxed">{run.summary}</p>
        <div className="mt-5 grid grid-cols-3 gap-4 border-t pt-5">
          <Figure label="Ordered" value={formatEUR(total)} />
          <Figure label="Stops tomorrow" value={String(run.route.length)} />
          <Figure label="Waiting for approval" value={String(waiting)} tone={waiting ? "warn" : undefined} />
        </div>
      </section>

      <Tabs defaultValue="orders">
        <TabsList className="h-12! w-full max-w-xl p-1">
          <TabsTrigger value="orders" className="text-base">Orders ({run.orders.length})</TabsTrigger>
          <TabsTrigger value="route" className="text-base">Route ({run.route.length})</TabsTrigger>
          <TabsTrigger value="decisions" className="text-base">Decisions ({decisions.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="mt-4">
          {run.orders.length === 0 ? (
            <EmptyState title="No orders tonight" description="Stock covers demand until the next delivery." />
          ) : (
            <div className="grid gap-4 2xl:grid-cols-2">
              {run.orders.map((o) => (
                <article key={o.id} className="flex flex-col rounded-2xl border bg-card p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-lg font-semibold">{o.supplier}</h3>
                      <p className="text-sm text-muted-foreground">
                        {o.id} · delivery {formatDate(o.deliveryDate)}
                      </p>
                    </div>
                    <span className="text-2xl font-bold tabular-nums">{formatEUR(o.total)}</span>
                  </div>
                  <OrderStatusBadge status={o.status} className="mt-3 self-start" />
                  <p className="mt-3 flex-1 text-base leading-relaxed">{o.explanation}</p>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {o.lines.map((l) => `${l.quantity} × ${l.product}`).join(" · ")}
                  </p>
                </article>
              ))}
            </div>
          )}
          <Link href="/orders" className="mt-4 inline-block text-base font-semibold text-primary hover:underline">
            Open orders and approvals →
          </Link>
        </TabsContent>

        <TabsContent value="route" className="mt-4">
          <RouteResults route={run.route} />
        </TabsContent>

        <TabsContent value="decisions" className="mt-4">
          {decisions.length === 0 ? (
            <EmptyState title="No decisions recorded" />
          ) : (
            <div className="grid gap-3 2xl:grid-cols-2">
              {decisions.map((d) => (
                <div
                  key={d.id}
                  className={cn(
                    "flex gap-3 rounded-xl border p-4",
                    d.type === "guardrail" ? "border-warn bg-warn-soft" : "bg-card",
                  )}
                >
                  {d.type === "guardrail" ? (
                    <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warn-strong" />
                  ) : (
                    <Lightbulb className="mt-0.5 size-5 shrink-0 text-primary" />
                  )}
                  <div>
                    <p className="text-base font-semibold">{d.title}</p>
                    {d.detail && <p className="mt-0.5 text-base text-muted-foreground">{d.detail}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div>
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div className={cn("text-3xl font-bold tabular-nums", tone === "warn" && "text-warn-strong")}>{value}</div>
    </div>
  );
}

function RouteResults({ route }: { route: Visit[] }) {
  const machines = useAsync(getMachines, "machines");
  if (route.length === 0) return <EmptyState title="No visits needed tomorrow" description="Every machine has enough stock until its next visit." />;

  const coords = new Map(machines.data?.map((m) => [m.id, m]) ?? []);
  const stops = route
    .map((v) => {
      const m = coords.get(v.machineId);
      return m ? { order: v.order, machineName: v.machineName, lat: m.lat, lng: m.lng } : null;
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  return (
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="h-[460px] overflow-hidden rounded-2xl border shadow-sm">
        {machines.error ? (
          <ErrorState error={machines.error} onRetry={machines.retry} className="h-full" />
        ) : machines.loading ? (
          <Skeleton className="size-full" />
        ) : (
          <RouteMap stops={stops} />
        )}
      </div>
      <ol className="space-y-3">
        {route.map((v) => (
          <li key={v.id} className="flex gap-4 rounded-2xl border bg-card p-4 shadow-sm">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-lg font-bold text-primary-foreground">{v.order}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/machines/${v.machineId}`} className="text-lg font-semibold hover:text-primary">
                  {v.machineName}
                </Link>
                <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="size-4" /> {v.machineId}
                </span>
              </div>
              <ul className="mt-2 flex flex-wrap gap-2">
                {v.loadList.map((l) => (
                  <li key={l.product} className="rounded-lg bg-muted px-2.5 py-1 text-sm">
                    <span className="font-bold tabular-nums">{l.quantity}×</span> {l.product}
                  </li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
