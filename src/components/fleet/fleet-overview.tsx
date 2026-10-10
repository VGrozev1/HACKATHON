"use client";

// C2: fleet overview. KPIs, then every machine as a card or on the map.

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpDown, Bell, Euro, Gauge, LayoutGrid, Map as MapIcon, Wifi } from "lucide-react";
import type { LocationType, Machine } from "@/types";
import { getMachines } from "@/lib/api";
import { formatEUR, formatEURRound } from "@/lib/format";
import { useAsync } from "@/hooks/use-async";
import { useCountUp } from "@/hooks/use-count-up";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, GridSkeleton } from "@/components/states";
import { FleetMap } from "@/components/maps";
import { Chip, Segmented } from "@/components/controls";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertBadge,
  LocationIcon,
  locationLabel,
  OfflineBadge,
  severityRank,
  StockBar,
  stockColor,
  stockLevel,
} from "@/components/status";

type View = "cards" | "map";
type Sort = "stock-asc" | "stock-desc" | "name";
const TYPES: LocationType[] = ["gym", "office", "hospital"];

export function FleetOverview() {
  const { data: machines, error, loading, retry } = useAsync(getMachines, "machines");
  const [view, setView] = useState<View>("cards");
  const [types, setTypes] = useState<Set<LocationType>>(new Set());
  const [sort, setSort] = useState<Sort>("stock-asc");

  const visible = useMemo(() => {
    if (!machines) return [];
    const list = machines.filter((m) => types.size === 0 || types.has(m.locationType));
    return [...list].sort((a, b) =>
      sort === "name" ? a.name.localeCompare(b.name) : sort === "stock-asc" ? a.stockPercent - b.stockPercent : b.stockPercent - a.stockPercent,
    );
  }, [machines, types, sort]);

  const toggleType = (t: LocationType) =>
    setTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  return (
    <>
      <PageHeader
        title="Fleet overview"
        description="20 machines across Sofia: stock, today's sales and anything that needs attention."
      />

      {error ? (
        <ErrorState error={error} onRetry={retry} />
      ) : (
        <>
          <Kpis machines={machines} loading={loading} />

          <div className="mt-10 mb-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by location type">
              <Chip active={types.size === 0} onClick={() => setTypes(new Set())}>
                All
                {machines && <span className="text-current/60">{machines.length}</span>}
              </Chip>
              {TYPES.map((t) => (
                <Chip key={t} active={types.has(t)} onClick={() => toggleType(t)}>
                  <LocationIcon type={t} className="size-4" />
                  {locationLabel[t]}s
                  {machines && <span className="text-current/60">{machines.filter((m) => m.locationType === t).length}</span>}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-base font-medium text-muted-foreground">
                <ArrowUpDown className="size-4" aria-hidden />
                <span className="sr-only">Sort</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as Sort)}
                  className="h-10 rounded-lg border bg-card px-3 text-base text-foreground"
                >
                  <option value="stock-asc">Lowest stock first</option>
                  <option value="stock-desc">Highest stock first</option>
                  <option value="name">Name</option>
                </select>
              </label>
              <Segmented
                value={view}
                onChange={setView}
                options={[
                  { value: "cards", label: "Cards", icon: <LayoutGrid className="size-4" /> },
                  { value: "map", label: "Map", icon: <MapIcon className="size-4" /> },
                ]}
              />
            </div>
          </div>

          {loading ? (
            view === "cards" ? <GridSkeleton count={8} /> : <Skeleton className="h-[620px] rounded-2xl" />
          ) : visible.length === 0 ? (
            <EmptyState
              title="No machines match these filters"
              description="Clear the filters to see the whole fleet."
              action={
                <button className="text-base font-semibold text-primary" onClick={() => setTypes(new Set())}>
                  Clear filters
                </button>
              }
            />
          ) : view === "cards" ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {visible.map((m) => (
                <MachineCard key={m.id} machine={m} />
              ))}
            </div>
          ) : (
            <div className="relative h-[620px] overflow-hidden rounded-2xl border shadow-sm">
              <FleetMap machines={visible} />
              <MapLegend />
            </div>
          )}
        </>
      )}
    </>
  );
}

function Kpis({ machines, loading }: { machines?: Machine[]; loading: boolean }) {
  const online = machines?.filter((m) => m.status === "online").length ?? 0;
  const avgStock = machines?.length ? machines.reduce((s, m) => s + m.stockPercent, 0) / machines.length : 0;
  const revenue = machines?.reduce((s, m) => s + m.todayRevenue, 0) ?? 0;
  const alerts = machines?.reduce((s, m) => s + m.alerts.filter((a) => a.severity !== "info").length, 0) ?? 0;
  const ready = !loading && !!machines;

  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi icon={<Wifi />} label="Machines online" loading={!ready} value={online} format={(n) => `${Math.round(n)}`} suffix={` / ${machines?.length ?? 0}`} />
      <Kpi
        icon={<Gauge />}
        label="Average stock"
        loading={!ready}
        value={avgStock}
        format={(n) => `${Math.round(n)}%`}
        tone={stockLevel(Math.round(avgStock))}
      />
      <Kpi icon={<Euro />} label="Today's revenue" loading={!ready} value={revenue} format={formatEURRound} sub={`${machines?.reduce((s, m) => s + m.todaySales, 0) ?? 0} items sold`} />
      <Kpi icon={<Bell />} label="Open alerts" loading={!ready} value={alerts} format={(n) => `${Math.round(n)}`} tone={alerts > 0 ? "crit" : "ok"} sub="Stock-outs, expiries, offline" />
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  format,
  suffix,
  sub,
  tone,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  format: (n: number) => string;
  suffix?: string;
  sub?: string;
  tone?: "ok" | "warn" | "crit";
  loading: boolean;
}) {
  const shown = useCountUp(value, 1000, !loading);
  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-2 text-base font-medium text-muted-foreground [&_svg]:size-5">
        {icon}
        {label}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-12 w-32" />
      ) : (
        <div className="mt-2 flex items-baseline gap-1">
          <span className="text-5xl font-bold tracking-tight tabular-nums" style={tone ? { color: stockColor[tone] } : undefined}>
            {format(shown)}
          </span>
          {suffix && <span className="text-2xl font-semibold text-muted-foreground">{suffix}</span>}
        </div>
      )}
      {sub && <div className="mt-1 text-sm text-muted-foreground">{sub}</div>}
    </div>
  );
}

function MachineCard({ machine: m }: { machine: Machine }) {
  const level = stockLevel(m.stockPercent);
  const alerts = [...m.alerts].sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
  return (
    <Link
      href={`/machines/${m.id}`}
      className={cn(
        "group flex flex-col rounded-2xl border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        m.status === "offline" && "border-crit/40",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold group-hover:text-primary">{m.name}</h3>
          <div className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
            <LocationIcon type={m.locationType} className="size-4" />
            {locationLabel[m.locationType]} · {m.id}
          </div>
        </div>
        {m.status === "offline" && <OfflineBadge />}
      </div>

      <div className="mt-5">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-sm font-medium text-muted-foreground">Stock</span>
          <span className="text-2xl font-bold tabular-nums" style={{ color: stockColor[level] }}>
            {m.stockPercent}%
          </span>
        </div>
        <StockBar percent={m.stockPercent} thick />
      </div>

      <div className="mt-4 flex items-baseline justify-between text-base">
        <span className="text-muted-foreground">Today</span>
        <span className="font-semibold tabular-nums">
          {m.todaySales} sold · {formatEUR(m.todayRevenue)}
        </span>
      </div>

      <div className="mt-4 flex min-h-7 flex-wrap gap-1.5">
        {alerts.length === 0 ? (
          <span className="text-sm text-muted-foreground">No alerts</span>
        ) : (
          <>
            {alerts.slice(0, 2).map((a) => (
              <AlertBadge key={a.id} alert={a} />
            ))}
            {alerts.length > 2 && <span className="self-center text-sm font-medium text-muted-foreground">+{alerts.length - 2} more</span>}
          </>
        )}
      </div>
    </Link>
  );
}

function MapLegend() {
  const items = [
    { label: "> 60% stock", color: "#16a34a" },
    { label: "40–60%", color: "#d97706" },
    { label: "< 40%", color: "#dc2626" },
    { label: "Offline", color: "#64748b" },
  ];
  return (
    <div className="absolute bottom-4 left-4 z-[500] flex flex-wrap gap-4 rounded-xl border bg-card/95 px-4 py-2.5 text-sm font-medium shadow-md">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-2">
          <span className="size-3.5 rounded-full ring-2 ring-white" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}
