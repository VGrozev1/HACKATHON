// Small status pieces shared across screens: stock bars, location icons, badges.

import { Building, Dumbbell, Hospital, WifiOff } from "lucide-react";
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

export const locationLabel: Record<LocationType, string> = {
  gym: "Gym",
  office: "Office",
  hospital: "Hospital",
};

export function LocationIcon({ type, className }: { type: LocationType; className?: string }) {
  const Icon = type === "gym" ? Dumbbell : type === "hospital" ? Hospital : Building;
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
