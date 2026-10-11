"use client";

// C3: machine detail. Sales, stock per slot with expiry, forecast vs actual, alerts.

import Link from "next/link";
import { use } from "react";
import { ArrowLeft, Lightbulb, TriangleAlert } from "lucide-react";
import type { Slot } from "@/types";
import { getForecast, getMachine, getSales, getStock } from "@/lib/api";
import { dayKey, formatDate, formatEUR, hoursUntil } from "@/lib/format";
import { useSimNow } from "@/hooks/use-sim-now";
import { useAsync } from "@/hooks/use-async";
import { cn } from "@/lib/utils";
import { PageHeader, Panel } from "@/components/page-header";
import { ChartSkeleton, EmptyState, ErrorState, RowsSkeleton } from "@/components/states";
import { ForecastChart, SalesAreaChart } from "@/components/charts";
import { Skeleton } from "@/components/ui/skeleton";
import { LocationTag, OfflineBadge, StockBar, stockColor, stockLevel } from "@/components/status";

export function MachineDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const now = useSimNow();
  const machine = useAsync(() => getMachine(id), `machine:${id}`);
  const sales = useAsync(() => getSales(id, 60), `sales:${id}`);
  const stock = useAsync(() => getStock(id), `stock:${id}`);
  const forecast = useAsync(() => getForecast(id), `forecast:${id}`);
  const m = machine.data;

  const back = (
    <Link href="/" className="mb-4 inline-flex items-center gap-1.5 text-base font-medium text-muted-foreground hover:text-primary">
      <ArrowLeft className="size-4" /> Fleet
    </Link>
  );

  if (machine.error) {
    return (
      <>
        {back}
        <ErrorState error={machine.error} onRetry={machine.retry} />
      </>
    );
  }

  return (
    <>
      {back}

      {!m ? (
        <div className="mb-8 space-y-3">
          <Skeleton className="h-10 w-96" />
          <Skeleton className="h-6 w-64" />
        </div>
      ) : (
        <PageHeader
          title={m.name}
          description={
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <LocationTag type={m.locationType} className="text-lg" />
              <span>{m.id}</span>
              <span className="inline-flex items-center gap-1.5">
                <span className={cn("size-2.5 rounded-full", m.status === "online" ? "bg-ok" : "bg-crit")} />
                {m.status === "online" ? "Online" : "Offline"}
              </span>
              <span>
                Today {m.todaySales} sold · {formatEUR(m.todayRevenue)}
              </span>
            </span>
          }
          actions={
            <div className="w-64 rounded-2xl border bg-card p-4 shadow-sm">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-base font-medium text-muted-foreground">Stock</span>
                <span className="text-4xl font-bold tabular-nums" style={{ color: stockColor[stockLevel(m.stockPercent)] }}>
                  {m.stockPercent}%
                </span>
              </div>
              <StockBar percent={m.stockPercent} thick />
              {m.status === "offline" && <OfflineBadge className="mt-3" />}
            </div>
          }
        />
      )}

      {m && m.alerts.length > 0 && (
        <section className="mb-6 grid gap-3 lg:grid-cols-2">
          {m.alerts.map((a) => (
            <div
              key={a.id}
              className={cn(
                "flex gap-3 rounded-xl border p-4",
                a.severity === "critical" ? "border-crit/30 bg-crit-soft" : a.severity === "warning" ? "border-warn/40 bg-warn-soft" : "bg-muted",
              )}
            >
              <TriangleAlert
                className={cn("mt-0.5 size-5 shrink-0", a.severity === "critical" ? "text-crit" : a.severity === "warning" ? "text-warn-strong" : "text-muted-foreground")}
                aria-hidden
              />
              <div>
                <p className="text-base font-semibold">{a.title}</p>
                {a.likelyCause && (
                  <p className="mt-0.5 flex items-start gap-1.5 text-base text-muted-foreground">
                    <Lightbulb className="mt-1 size-4 shrink-0" aria-hidden />
                    Likely cause: {a.likelyCause}
                  </p>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      <div className="grid gap-6 2xl:grid-cols-2">
        <Panel title="Sales, last 60 days" description="Daily revenue; hover a day for items sold." className="2xl:col-span-2">
          {sales.error ? (
            <ErrorState error={sales.error} onRetry={sales.retry} />
          ) : !sales.data ? (
            <ChartSkeleton />
          ) : sales.data.length === 0 ? (
            <EmptyState title="No sales recorded yet" />
          ) : (
            <>
              <SalesTotals data={sales.data} />
              <SalesAreaChart data={sales.data} />
            </>
          )}
        </Panel>

        <Panel title="Stock per slot" description="Expiring within 2 days is highlighted in red.">
          {stock.error ? (
            <ErrorState error={stock.error} onRetry={stock.retry} />
          ) : !stock.data ? (
            <RowsSkeleton rows={8} />
          ) : stock.data.length === 0 ? (
            <EmptyState title="No slots configured" />
          ) : (
            <StockTable slots={stock.data} />
          )}
        </Panel>

        <Panel
          title="Forecast vs actual"
          description={`${forecast.data?.some((p) => p.actual === null) ? "Last 14 days and the days ahead" : "Last 14 days"}. Dashed: forecast. Solid: actual.`}
        >
          {forecast.error ? (
            <ErrorState error={forecast.error} onRetry={forecast.retry} />
          ) : !forecast.data ? (
            <ChartSkeleton />
          ) : forecast.data.length === 0 ? (
            <EmptyState title="No forecast yet" description="The agent forecasts each machine during its nightly run." />
          ) : (
            <ForecastChart data={forecast.data} today={dayKey(now)} height={380} />
          )}
        </Panel>
      </div>
    </>
  );
}

function SalesTotals({ data }: { data: { units: number; revenue: number }[] }) {
  const units = data.reduce((s, d) => s + d.units, 0);
  const revenue = data.reduce((s, d) => s + d.revenue, 0);
  const avg = revenue / data.length;
  return (
    <div className="mb-4 flex flex-wrap gap-x-10 gap-y-2">
      <Stat label="Revenue" value={formatEUR(revenue)} />
      <Stat label="Items sold" value={units.toLocaleString("en-GB")} />
      <Stat label="Per day" value={formatEUR(avg)} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function expiryText(iso: string, now: Date): { text: string; urgent: boolean } {
  if (!iso) return { text: "–", urgent: false };
  const hours = hoursUntil(iso, now);
  if (hours < 0) return { text: "Expired", urgent: true };
  if (hours < 24) return { text: `in ${Math.round(hours)} h`, urgent: true };
  const days = Math.floor(hours / 24);
  return { text: days <= 14 ? `${formatDate(iso)} · in ${days} day${days === 1 ? "" : "s"}` : formatDate(iso), urgent: hours <= 48 };
}

function StockTable({ slots }: { slots: Slot[] }) {
  const now = useSimNow();
  return (
    <div className="-mx-2 overflow-x-auto">
      <table className="w-full min-w-[520px] text-base">
        <thead>
          <tr className="border-b text-left text-sm text-muted-foreground">
            <th className="px-2 pb-2 font-medium">Slot</th>
            <th className="px-2 pb-2 font-medium">Product</th>
            <th className="px-2 pb-2 font-medium">Quantity</th>
            <th className="px-2 pb-2 font-medium">Expiry</th>
          </tr>
        </thead>
        <tbody>
          {slots.map((s) => {
            const pct = Math.round((s.quantity / s.capacity) * 100);
            const exp = expiryText(s.expiryDate, now);
            const urgent = exp.urgent && s.quantity > 0;
            return (
              <tr key={s.id} className={cn("border-b last:border-0", urgent && "bg-crit-soft")}>
                <td className="px-2 py-2.5 font-mono text-sm text-muted-foreground">{s.id.split("-").pop()}</td>
                <td className="px-2 py-2.5 font-medium">{s.product.name}</td>
                <td className="px-2 py-2.5">
                  <div className="flex items-center gap-3">
                    <StockBar percent={pct} className="w-24" />
                    <span className={cn("tabular-nums", s.quantity === 0 && "font-semibold text-crit")}>
                      {s.quantity} / {s.capacity}
                    </span>
                  </div>
                </td>
                <td className={cn("px-2 py-2.5 whitespace-nowrap", urgent ? "font-semibold text-crit" : "text-muted-foreground")}>{exp.text}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
