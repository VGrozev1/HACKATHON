// Loading, empty and error states, so the demo never shows a blank screen.

import { RotateCcw, TriangleAlert, Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: Error;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-crit/30 bg-crit-soft px-6 py-10 text-center",
        className,
      )}
    >
      <TriangleAlert className="size-8 text-crit" aria-hidden />
      <div>
        <p className="text-lg font-semibold">Couldn&apos;t load this</p>
        <p className="mt-1 text-base text-muted-foreground">{error.message}</p>
      </div>
      <Button size="lg" variant="outline" onClick={onRetry} className="h-10 px-4 text-base">
        <RotateCcw /> Try again
      </Button>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center",
        className,
      )}
    >
      <div className="text-muted-foreground [&_svg]:size-8">{icon ?? <Inbox aria-hidden />}</div>
      <div>
        <p className="text-lg font-semibold">{title}</p>
        {description && <p className="mt-1 text-base text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function GridSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4", className)} aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-48 rounded-xl" />
      ))}
    </div>
  );
}

export function RowsSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12 rounded-lg" />
      ))}
    </div>
  );
}

export function ChartSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("h-72 w-full rounded-xl", className)} aria-busy="true" />;
}
