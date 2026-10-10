"use client";

// C7: investor view. A read-only monthly statement for one machine, styled like a document
// an investor would receive: calmer and more formal than the operator screens.

import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { Download, Landmark } from "lucide-react";
import type { InvestorStatement } from "@/types";
import { getInvestorStatement, getMachines } from "@/lib/api";
import { formatEUR, formatMonth } from "@/lib/format";
import { useAsync } from "@/hooks/use-async";
import { cn } from "@/lib/utils";
import { ErrorState, RowsSkeleton } from "@/components/states";
import { Segmented } from "@/components/controls";
import { locationLabel } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type Model = "A" | "B" | "C";

const MODELS: Record<Model, { name: string; terms: string }> = {
  A: { name: "Fixed rent", terms: "A fixed €220 every month, whatever the machine sells." },
  B: { name: "Revenue share", terms: "15% of the machine's gross sales." },
  C: { name: "Profit share", terms: "50% of the machine's net profit after all costs." },
};

/**
 * An investor's own terms, for the investor portal: the statement is locked to their
 * payout model and value, and the machine picker lists only their machines.
 */
export interface FixedTerms {
  model: Model;
  value: number;
  /** "20% of sales", "fixed €120 a month" */
  terms: string;
  machineIds: string[];
}

export function InvestorView({
  params,
  fixed,
  basePath = "/investor",
}: {
  params: Promise<{ machineId: string }>;
  fixed?: FixedTerms;
  basePath?: string;
}) {
  const { machineId } = use(params);
  const router = useRouter();
  const [chosen, setChosen] = useState<Model>("B");
  const model = fixed?.model ?? chosen;
  const termsText = fixed ? `${fixed.terms.charAt(0).toUpperCase()}${fixed.terms.slice(1)}.` : MODELS[model].terms;
  const allMachines = useAsync(getMachines, "machines");
  const machines = { data: allMachines.data?.filter((m) => !fixed || fixed.machineIds.includes(m.id)) };
  const statement = useAsync(
    () => getInvestorStatement(machineId, model, fixed?.value),
    `statement:${machineId}:${model}:${fixed?.value ?? "default"}`,
  );
  const machine = machines.data?.find((m) => m.id === machineId);
  const s = statement.data;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight lg:text-[2rem]">Investor statement</h1>
          <p className="mt-1.5 text-lg text-muted-foreground">What one machine earned its investor last month.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-base font-medium text-muted-foreground">
            Machine
            <select
              value={machineId}
              onChange={(e) => router.push(`${basePath}/${e.target.value}${fixed ? "/statement" : ""}`)}
              className="h-10 min-w-64 rounded-lg border bg-card px-3 text-base text-foreground"
              disabled={!machines.data}
            >
              {!machines.data && <option>{machineId}</option>}
              {machines.data?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <Button variant="outline" className="h-10 px-4 text-base" onClick={() => window.print()} disabled={!s}>
            <Download /> Download statement
          </Button>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border bg-card p-5 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">Payout model</div>
            <p className="mt-1 text-base">
              <b>{MODELS[model].name}.</b> {termsText}
            </p>
          </div>
          {fixed ? (
            <span className="text-sm text-muted-foreground">Your contract terms</span>
          ) : (
            <Segmented
              value={model}
              onChange={setChosen}
              options={(["A", "B", "C"] as Model[]).map((m) => ({ value: m, label: `${m} · ${MODELS[m].name}` }))}
            />
          )}
        </div>
      </div>

      <article className="rounded-sm border bg-white px-10 py-12 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_12px_40px_-12px_rgb(0_0_0/0.12)] print:border-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-foreground pb-6">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-full border-2 border-foreground">
              <Landmark className="size-5" />
            </span>
            <div>
              <div className="font-serif text-2xl font-semibold">VendAI Operations</div>
              <div className="text-sm text-muted-foreground">Monthly statement to the machine&apos;s investor</div>
            </div>
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1 text-base">
            <dt className="text-muted-foreground">Period</dt>
            <dd className="font-medium">{s ? formatMonth(s.month) : <Skeleton className="h-5 w-32" />}</dd>
            <dt className="text-muted-foreground">Machine</dt>
            <dd className="font-medium">{machine ? `${machine.name} (${machine.id})` : machineId}</dd>
            {machine && (
              <>
                <dt className="text-muted-foreground">Location</dt>
                <dd className="font-medium">
                  {locationLabel[machine.locationType]}, {machine.city}
                </dd>
              </>
            )}
            <dt className="text-muted-foreground">Payout model</dt>
            <dd className="font-medium">
              {model}: {MODELS[model].name}
            </dd>
          </dl>
        </header>

        {statement.error ? (
          <ErrorState error={statement.error} onRetry={statement.retry} className="mt-8" />
        ) : !s ? (
          <div className="mt-8 space-y-8">
            <div className="grid grid-cols-3 gap-6">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
            <RowsSkeleton rows={7} />
          </div>
        ) : (
          <StatementBody statement={s} model={model} termsText={termsText} />
        )}
      </article>
    </div>
  );
}

function StatementBody({ statement: s, model, termsText }: { statement: InvestorStatement; model: Model; termsText: string }) {
  const net = s.sales - s.costs;
  return (
    <>
      <section className="mt-8 grid gap-6 sm:grid-cols-3">
        <Summary label="Sales" value={formatEUR(s.sales)} />
        <Summary label="Costs" value={formatEUR(s.costs)} />
        <Summary label="Net" value={formatEUR(net)} />
      </section>

      <section className="mt-10">
        <h2 className="mb-3 font-serif text-xl font-semibold">Statement</h2>
        <table className="w-full text-base">
          <tbody>
            {s.lines.map((l) => {
              const total = l.label === "Net profit";
              return (
                <tr key={l.label} className={cn("border-b", total && "border-t-2 border-b-0 border-t-foreground")}>
                  <td className={cn("py-3", total ? "font-semibold" : "text-foreground/85")}>{l.label}</td>
                  <td className={cn("py-3 text-right tabular-nums", total ? "font-semibold" : l.amount < 0 && "text-foreground/70")}>
                    {l.amount < 0 ? `(${formatEUR(-l.amount)})` : formatEUR(l.amount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-sm border-2 border-foreground px-6 py-5">
        <div>
          <div className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">Payout to investor</div>
          <div className="mt-1 text-base">
            Model {model}, {termsText.charAt(0).toLowerCase() + termsText.slice(1)}
          </div>
        </div>
        <div className="font-serif text-4xl font-semibold tabular-nums">{formatEUR(s.payout)}</div>
      </section>

      <footer className="mt-10 border-t pt-4 text-sm text-muted-foreground">
        Figures come from the machine&apos;s card-reader and cash records. Paid by bank transfer within 10 working days of the
        period end. Simulated data for the demo.
      </footer>
    </>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l-2 border-foreground/15 pl-4">
      <div className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">{label}</div>
      <div className="mt-1 font-serif text-3xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
