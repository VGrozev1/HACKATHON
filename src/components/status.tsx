// Small status pieces shared across screens: stock bars, location icons, badges.

import { Building, Dumbbell, GraduationCap, Hospital, WifiOff } from "lucide-react";
import type { Alert, LocationType, OrderStatus } from "@/types";
import { cn } from "@/lib/utils";

export type StockLevel = "ok" | "warn" | "crit";

/** green > 60%, amber 40–60%, red < 40% */
export function stockLevel(percent: number): StockLevel {
  return percent > 60 ? "ok" : percent >= 40 ? "warn" : "crit";
}

export const stockColor: Record<StockLevel, string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  crit: "var(--crit)",
};

export function StockBar({ percent, className, thick }: { percent: number; className?: string; thick?: boolean }) {
  const level = stockLevel(percent);
  return (
    <div
      className={cn("w-full overflow-hidden rounded-full bg-muted", thick ? "h-3" : "h-2.5", className)}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-label={`Stock ${percent}%`}
    >
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${Math.max(2, Math.min(100, percent))}%`, background: stockColor[level] }}
      />
    </div>
  );
}

export const locationPlural: Record<LocationType, string> = {
  gym: "Gyms",
  office: "Offices",
  hospital: "Hospitals",
  university: "Universities",
};

export const locationLabel: Record<LocationType, string> = {
  gym: "Gym",
  office: "Office",
  hospital: "Hospital",
  university: "University",
};

export function LocationIcon({ type, className }: { type: LocationType; className?: string }) {
  const Icon = { gym: Dumbbell, office: Building, hospital: Hospital, university: GraduationCap }[type];
  return <Icon className={className} aria-hidden />;
}

export function LocationTag({ type, className }: { type: LocationType; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground", className)}>
      <LocationIcon type={type} className="size-4" />
      {locationLabel[type]}
    </span>
  );
}

const pill = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-semibold whitespace-nowrap";

export const orderStatusMeta: Record<OrderStatus, { label: string; className: string }> = {
  sent_automatically: { label: "Sent automatically", className: "bg-info-soft text-info" },
  waiting_for_approval: { label: "Waiting for approval", className: "bg-warn-soft text-warn-strong ring-1 ring-warn/40" },
  approved: { label: "Approved", className: "bg-ok-soft text-ok" },
  rejected: { label: "Rejected", className: "bg-muted text-muted-foreground" },
};

export function OrderStatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const meta = orderStatusMeta[status];
  return <span className={cn(pill, meta.className, className)}>{meta.label}</span>;
}

const alertStyle: Record<Alert["severity"], string> = {
  critical: "bg-crit-soft text-crit",
  warning: "bg-warn-soft text-warn-strong",
  info: "bg-muted text-muted-foreground",
};

export function AlertBadge({ alert, className }: { alert: Alert; className?: string }) {
  return (
    <span className={cn(pill, "max-w-full font-medium", alertStyle[alert.severity], className)} title={alert.likelyCause}>
      <span className="truncate">{alert.title}</span>
    </span>
  );
}

export function OfflineBadge({ className }: { className?: string }) {
  return (
    <span className={cn(pill, "bg-crit text-white", className)}>
      <WifiOff className="size-3.5" aria-hidden /> Offline
    </span>
  );
}

export const severityRank: Record<Alert["severity"], number> = { critical: 0, warning: 1, info: 2 };

/** Why an order was rejected (by the guardrail or the operator), as a short list. */
export function RejectionReasons({ reasons, className }: { reasons?: string[]; className?: string }) {
  if (!reasons?.length) return null;
  return (
    <div className={cn("rounded-xl border border-crit/30 bg-crit-soft px-4 py-3", className)}>
      <p className="text-sm font-bold tracking-wide text-crit uppercase">Why it was rejected</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-base">
        {reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </div>
  );
}

/** Awaiting approval first, rejected last, otherwise newest first. */
export const orderStatusRank: Record<OrderStatus, number> = {
  waiting_for_approval: 0,
  sent_automatically: 1,
  approved: 2,
  rejected: 3,
};
