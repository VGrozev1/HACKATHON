"use client";

// Owner portal: the page a machine's investor or owner opens to see how their machine
// is doing, what it earns, and what the agent suggests. Suggestions are never applied
// without the owner's OK (guardrail B5: price changes and swaps are suggestions only).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import {
  ArrowLeftRight,
  Check,
  CircleCheck,
  Euro,
  FileText,
  Gauge,
  Loader2,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Tag,
  Truck,
  TriangleAlert,
  WifiOff,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { AgentSuggestion, Machine, SuggestionKind } from "@/types";
import {
  getInvestorStatement,
  getMachine,
  getMachines,
  getProfitHistory,
  getStock,
  getSuggestions,
  respondToSuggestion,
} from "@/lib/api";
import { formatEUR, formatEURRound, formatMonth } from "@/lib/format";
import { useAsync } from "@/hooks/use-async";
import { useCountUp } from "@/hooks/use-count-up";
import { cn } from "@/lib/utils";
import { Panel } from "@/components/page-header";
import { ChartSkeleton, EmptyState, ErrorState, RowsSkeleton } from "@/components/states";
import { ProfitWeeksChart } from "@/components/charts";
import { LocationTag, StockBar, stockColor, stockLevel } from "@/components/status";
import { Button } from "@/components/ui/button";
import { VendingMachine } from "@/components/vending/vending-machine";
import { Skeleton } from "@/components/ui/skeleton";

export function OwnerPortal({ params }: { params: Promise<{ machineId: string }> }) {
  const { machineId } = use(params);
  const router = useRouter();
  const machines = useAsync(getMachines, "machines");
  const machine = useAsync(() => getMachine(machineId), `machine:${machineId}`);

  if (machine.error) return <ErrorState error={machine.error} onRetry={machine.retry} />;
  const m = machine.data;

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold tracking-wider text-primary uppercase">Owner portal</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight lg:text-[2rem]">My machine</h1>
          <p className="mt-1.5 text-lg text-muted-foreground">How your machine is doing, what it earns, and what the agent suggests.</p>
        </div>
        <label className="flex items-center gap-2 text-base font-medium text-muted-foreground">
          Viewing as owner of
          <select
            value={machineId}
            onChange={(e) => router.push(`/owner/${e.target.value}`)}
            className="h-10 min-w-64 rounded-lg border bg-card px-3 text-base text-foreground"
            disabled={!machines.data}
          >
            {!machines.data && <option>{machineId}</option>}
            {machines.data?.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {m ? <HealthBanner machine={m} /> : <Skeleton className="h-36 rounded-2xl" />}
      <Kpis machineId={machineId} machine={m} />
      <InsideTheMachine machineId={machineId} machine={m} />

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <ProfitPanel machineId={machineId} />
        <RunningLow machineId={machineId} />
      </div>

      <Suggestions machineId={machineId} />
    </div>
  );
}

// ─── How it's doing ──────────────────────────────────────────────────────────

function HealthBanner({ machine: m }: { machine: Machine }) {
  const serious = m.alerts.filter((a) => a.severity !== "info");
  const state =
    m.status === "offline"
      ? { label: "Offline", icon: <WifiOff />, box: "border-crit/40 bg-crit-soft", pill: "bg-crit text-white" }
      : serious.length
        ? { label: "Needs attention", icon: <TriangleAlert />, box: "border-warn/50 bg-warn-soft", pill: "bg-warn text-foreground" }
        : { label: "Working normally", icon: <CircleCheck />, box: "border-ok/40 bg-ok-soft", pill: "bg-ok text-white" };
  const restockSoon = m.stockPercent < 40 || m.alerts.some((a) => /expire/.test(a.title));

  return (
    <section className={cn("flex flex-wrap items-start justify-between gap-6 rounded-2xl border-2 p-6", state.box)}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-bold">{m.name}</h2>
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold [&_svg]:size-4", state.pill)}>
            {state.icon}
            {state.label}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 text-base text-muted-foreground">
          <LocationTag type={m.locationType} className="text-base" />
          <span>{m.city}</span>
          <span>{m.id}</span>
        </div>
        {serious.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {serious.map((a) => (
              <li key={a.id} className="text-base">
                <b>{a.title}.</b> <span className="text-muted-foreground">{a.likelyCause}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-base text-muted-foreground">Nothing needs your attention. The agent checks it every night.</p>
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-2 rounded-xl bg-card/80 px-5 py-4 text-base">
        <span className="inline-flex items-center gap-2 font-semibold">
          <Truck className="size-5 text-primary" />
          {restockSoon ? "Restock booked for tomorrow" : "Next restock on the usual schedule"}
        </span>
        <span className="text-sm text-muted-foreground">
          {restockSoon ? "It's on tonight's route plan." : "The agent adds a visit if stock runs low."}
        </span>
      </div>
    </section>
  );
}

function Kpis({ machineId, machine }: { machineId: string; machine?: Machine }) {
  const profit = useAsync(() => getProfitHistory(machineId), `profit:${machineId}`);
  const statement = useAsync(() => getInvestorStatement(machineId, "B"), `statement:${machineId}:B`);
  const last4 = profit.data?.slice(-5, -1).reduce((s, w) => s + w.profit, 0);

  return (
    <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi icon={<Euro />} label="Profit, last 4 weeks" value={last4} format={formatEURRound} sub="After goods, rent, servicing and fees" />
      <Kpi
        icon={<FileText />}
        label="Your payout"
        value={statement.data?.payout}
        format={formatEURRound}
        sub={statement.data ? `${formatMonth(statement.data.month)}, model B (15% of sales)` : undefined}
        link={{ href: `/investor/${machineId}`, label: "Full statement" }}
      />
      <Kpi
        icon={<ShoppingBag />}
        label="Sales today"
        value={machine?.todayRevenue}
        format={formatEUR}
        sub={machine ? `${machine.todaySales} items sold` : undefined}
      />
      <Kpi
        icon={<Gauge />}
        label="Stock"
        value={machine?.stockPercent}
        format={(n) => `${Math.round(n)}%`}
        tone={machine ? stockLevel(machine.stockPercent) : undefined}
        bar={machine?.stockPercent}
      />
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  format,
  sub,
  tone,
  bar,
  link,
}: {
  icon: React.ReactNode;
  label: string;
  value?: number;
  format: (n: number) => string;
  sub?: string;
  tone?: "ok" | "warn" | "crit";
  bar?: number;
  link?: { href: string; label: string };
}) {
  const shown = useCountUp(value ?? 0, 900, value !== undefined);
  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      <span className="flex items-center gap-2 text-base font-medium text-muted-foreground [&_svg]:size-5">
        {icon}
        {label}
      </span>
      {value === undefined ? (
        <Skeleton className="mt-3 h-11 w-32" />
      ) : (
        <div className="mt-2 text-4xl font-bold tracking-tight tabular-nums" style={tone ? { color: stockColor[tone] } : undefined}>
          {format(shown)}
        </div>
      )}
      {bar !== undefined && <StockBar percent={bar} className="mt-3" />}
      {sub && <div className="mt-1 text-sm text-muted-foreground">{sub}</div>}
      {link && (
        <Link href={link.href} className="mt-2 inline-block text-sm font-semibold text-primary hover:underline">
          {link.label} →
        </Link>
      )}
    </div>
  );
}

function ProfitPanel({ machineId }: { machineId: string }) {
  const profit = useAsync(() => getProfitHistory(machineId), `profit:${machineId}`);
  return (
    <Panel title="Sales and profit by week" description="Last 8 weeks. The latest week is still running.">
      {profit.error ? (
        <ErrorState error={profit.error} onRetry={profit.retry} />
      ) : !profit.data ? (
        <ChartSkeleton />
      ) : profit.data.length === 0 ? (
        <EmptyState title="No sales yet" description="Profit shows up after the machine's first week." />
      ) : (
        <ProfitWeeksChart data={profit.data} />
      )}
    </Panel>
  );
}

/** The machine as it looks on site: every slot, its products and how many are left. */
function InsideTheMachine({ machineId, machine }: { machineId: string; machine?: Machine }) {
  const stock = useAsync(() => getStock(machineId), `stock:${machineId}`);
  return (
    <section className="mt-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Inside your machine</h2>
          <p className="mt-1 text-base text-muted-foreground">
            Every slot as it looks right now. Click a slot, or type its code on the keypad, to see what&apos;s left.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="rounded bg-red-600 px-1 text-[10px] font-black text-white">SOLD OUT</span> empty slot
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded-full bg-amber-400" /> expires within 48 h
          </span>
        </div>
      </div>
      {stock.error ? (
        <ErrorState error={stock.error} onRetry={stock.retry} />
      ) : !stock.data || !machine ? (
        <Skeleton className="h-[640px] rounded-[28px]" />
      ) : stock.data.length === 0 ? (
        <EmptyState title="No slots configured" />
      ) : (
        <VendingMachine slots={stock.data} name={machine.name} offline={machine.status === "offline"} />
      )}
    </section>
  );
}

function RunningLow({ machineId }: { machineId: string }) {
  const stock = useAsync(() => getStock(machineId), `stock:${machineId}`);
  const low = stock.data
    ?.map((s) => ({ ...s, pct: Math.round((s.quantity / s.capacity) * 100) }))
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 6);
  return (
    <Panel title="Running low" description="The emptiest slots right now.">
      {stock.error ? (
        <ErrorState error={stock.error} onRetry={stock.retry} />
      ) : !low ? (
        <RowsSkeleton rows={6} />
      ) : low.length === 0 ? (
        <EmptyState title="No slots configured" />
      ) : (
        <ul className="space-y-3">
          {low.map((s) => (
            <li key={s.id} className="flex items-center gap-3">
              <span className="w-8 shrink-0 font-mono text-sm text-muted-foreground">{s.id.split("-").pop()}</span>
              <span className="min-w-0 flex-1 text-base leading-snug font-medium">{s.product.name}</span>
              <StockBar percent={s.pct} className="w-16 shrink-0" />
              <span className={cn("w-14 shrink-0 text-right text-base tabular-nums", s.quantity === 0 && "font-semibold text-crit")}>
                {s.quantity}/{s.capacity}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ─── Suggestions ─────────────────────────────────────────────────────────────

const KIND: Record<SuggestionKind, { icon: React.ReactNode; label: string }> = {
  price: { icon: <Tag />, label: "Price" },
  swap: { icon: <ArrowLeftRight />, label: "Product swap" },
  restock: { icon: <Truck />, label: "Restocking" },
  service: { icon: <Wrench />, label: "Repair" },
};

function Suggestions({ machineId }: { machineId: string }) {
  const { data, error, loading, retry, mutate } = useAsync(() => getSuggestions(machineId), `suggestions:${machineId}`);
  const [busy, setBusy] = useState<string | null>(null);

  const respond = async (s: AgentSuggestion, status: "accepted" | "dismissed") => {
    setBusy(s.id);
    try {
      await respondToSuggestion(s.id, status);
      mutate((list) => list.map((x) => (x.id === s.id ? { ...x, status } : x)));
      if (status === "accepted") {
        toast.success("Suggestion accepted", { description: "Sent to the operator. The agent applies it from tomorrow night." });
      }
    } catch (e) {
      toast.error("Couldn't save your answer", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const open = data?.filter((s) => s.status === "open") ?? [];
  const potential = open.reduce((sum, s) => sum + s.impactPerMonth, 0);

  return (
    <section className="mt-10">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Sparkles className="size-6 text-primary" /> Suggestions from the agent
          </h2>
          <p className="mt-1 text-base text-muted-foreground">
            Based on this machine&apos;s sales, stock and waste. Nothing changes until you accept it.
          </p>
        </div>
        {potential > 0 && (
          <span className="rounded-full bg-accent px-4 py-1.5 text-base font-semibold text-accent-foreground">
            Up to +{formatEURRound(potential)} a month if you accept them all
          </span>
        )}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={retry} />
      ) : loading || !data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <EmptyState title="No suggestions right now" description="The agent will suggest changes when it spots something." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.map((s) => (
            <SuggestionCard key={s.id} s={s} busy={busy === s.id} onRespond={(status) => respond(s, status)} />
          ))}
        </div>
      )}

      <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="size-4 text-primary" />
        The agent only suggests: prices and product swaps never change without your OK.
      </p>
    </section>
  );
}

function SuggestionCard({
  s,
  busy,
  onRespond,
}: {
  s: AgentSuggestion;
  busy: boolean;
  onRespond: (status: "accepted" | "dismissed") => void;
}) {
  const kind = KIND[s.kind];
  if (s.status === "dismissed") {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-dashed px-5 py-4 text-base text-muted-foreground">
        <X className="size-4" /> Dismissed: {s.title}
      </div>
    );
  }
  return (
    <article
      className={cn(
        "flex flex-col rounded-2xl border bg-card p-5 shadow-sm transition-colors",
        s.status === "accepted" && "border-ok/50 bg-ok-soft",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold tracking-wide text-primary uppercase [&_svg]:size-4">
          {kind.icon}
          {kind.label}
        </span>
        {s.impactPerMonth > 0 && (
          <span className="rounded-full bg-ok-soft px-2.5 py-0.5 text-sm font-bold text-ok tabular-nums">
            +{formatEURRound(s.impactPerMonth)}/month
          </span>
        )}
      </div>
      <h3 className="mt-2 text-lg leading-snug font-semibold">{s.title}</h3>
      <p className="mt-1.5 flex-1 text-base text-muted-foreground">{s.reason}</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          Confidence: <b className="text-foreground">{s.confidence}</b>
        </span>
        {s.status === "accepted" ? (
          <span className="inline-flex items-center gap-1.5 text-base font-semibold text-ok">
            <Check className="size-5" /> Accepted: applies from tomorrow night
          </span>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" className="h-10 px-4 text-base" disabled={busy} onClick={() => onRespond("dismissed")}>
              Dismiss
            </Button>
            <Button className="h-10 px-4 text-base" disabled={busy} onClick={() => onRespond("accepted")}>
              {busy ? <Loader2 className="animate-spin" /> : <Check />}
              Accept
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}
