"use client";

// Investor portal home: every machine this investor owns, with totals across them.

import Link from "next/link";
import { ArrowRight, Bell, Euro, Gauge, Store } from "lucide-react";
import { getMachines } from "@/lib/api";
import { formatEUR, formatEURRound } from "@/lib/format";
import { useAsync } from "@/hooks/use-async";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState, GridSkeleton } from "@/components/states";
import { LocationTag, OfflineBadge, StockBar, stockColor, stockLevel } from "@/components/status";
import type { PortalInvestorView } from "@/components/owner/owner-portal";
import { payoutTerms } from "@/lib/insights";

export function MyMachines({ investor }: { investor: PortalInvestorView }) {
  const { data, error, loading, retry } = useAsync(getMachines, "machines");
  const mine = data?.filter((m) => investor.machineIds.includes(m.id)) ?? [];
  const revenue = mine.reduce((s, m) => s + m.todayRevenue, 0);
  const sold = mine.reduce((s, m) => s + m.todaySales, 0);
  const avgStock = mine.length ? Math.round(mine.reduce((s, m) => s + m.stockPercent, 0) / mine.length) : 0;
  const attention = mine.filter((m) => m.status === "offline" || m.alerts.some((a) => a.severity !== "info")).length;

  return (
    <>
      <div className="mb-8">
        <p className="text-sm font-bold tracking-wider text-primary uppercase">Welcome back</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight lg:text-[2rem]">{investor.name}</h1>
        <p className="mt-1.5 text-lg text-muted-foreground">
          {investor.machineIds.length} machine{investor.machineIds.length === 1 ? "" : "s"} · payout model {investor.payoutModel} (
          {payoutTerms(investor)})
        </p>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={retry} />
      ) : loading ? (
        <GridSkeleton count={4} />
      ) : mine.length === 0 ? (
        <EmptyState title="No machines yet" description="Machines you invest in show up here once they're installed." />
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <Total icon={<Store />} label="Machines" value={String(mine.length)} />
            <Total icon={<Euro />} label="Sales today" value={formatEURRound(revenue)} sub={`${sold} items sold`} />
            <Total icon={<Gauge />} label="Average stock" value={`${avgStock}%`} tone={stockLevel(avgStock)} />
            <Total
              icon={<Bell />}
              label="Need attention"
              value={String(attention)}
              tone={attention ? "crit" : "ok"}
              sub={attention ? "offline, sold out or expiring" : "all running normally"}
            />
          </div>

          <h2 className="mt-10 mb-4 text-2xl font-bold tracking-tight">Your machines</h2>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {mine.map((m) => {
              const issues = m.alerts.filter((a) => a.severity !== "info");
              return (
                <Link
                  key={m.id}
                  href={`/owner/${m.id}`}
                  className={cn(
                    "group flex flex-col rounded-2xl border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md",
                    m.status === "offline" && "border-crit/40",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-lg font-semibold group-hover:text-primary">{m.name}</h3>
                      <LocationTag type={m.locationType} />
                    </div>
                    {m.status === "offline" && <OfflineBadge />}
                  </div>
                  <div className="mt-5 mb-1.5 flex items-baseline justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Stock</span>
                    <span className="text-2xl font-bold tabular-nums" style={{ color: stockColor[stockLevel(m.stockPercent)] }}>
                      {m.stockPercent}%
                    </span>
                  </div>
                  <StockBar percent={m.stockPercent} thick />
                  <div className="mt-4 flex items-baseline justify-between text-base">
                    <span className="text-muted-foreground">Today</span>
                    <span className="font-semibold tabular-nums">
                      {m.todaySales} sold · {formatEUR(m.todayRevenue)}
                    </span>
                  </div>
                  <p className={cn("mt-3 min-h-6 text-sm", issues.length ? "font-medium text-crit" : "text-muted-foreground")}>
                    {issues.length ? issues[0].title : "Working normally"}
                    {issues.length > 1 && ` · +${issues.length - 1} more`}
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1 text-base font-semibold text-primary">
                    Look inside <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
                  </span>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

function Total({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: "ok" | "warn" | "crit";
}) {
  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-2 text-base font-medium text-muted-foreground [&_svg]:size-5">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-4xl font-bold tracking-tight tabular-nums" style={tone ? { color: stockColor[tone] } : undefined}>
        {value}
      </div>
      {sub && <div className="mt-1 text-sm text-muted-foreground">{sub}</div>}
    </div>
  );
}
