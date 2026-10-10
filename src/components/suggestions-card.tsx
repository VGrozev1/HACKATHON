"use client";

// The agent's suggestions for the manager (Viktor's create_suggestion): things beyond
// tonight's restock. Accept or reject only records a decision; this card never changes
// prices, stock or orders (guardrail B5).

import { useState } from "react";
import { ArrowLeftRight, CalendarClock, Check, PackagePlus, ShieldCheck, Tag, TrendingUp, X } from "lucide-react";
import { toast } from "sonner";
import type { Suggestion, SuggestionType } from "@/types";
import { acceptSuggestion, getNightSuggestions, rejectSuggestion } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useAsync } from "@/hooks/use-async";
import { cn } from "@/lib/utils";
import { Segmented } from "@/components/controls";
import { ErrorState, RowsSkeleton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

const TYPE: Record<SuggestionType, { label: string; icon: React.ReactNode; className: string }> = {
  extra_stock: { label: "Extra stock", icon: <PackagePlus />, className: "bg-accent text-accent-foreground" },
  product_swap: { label: "Product swap", icon: <ArrowLeftRight />, className: "bg-info-soft text-info" },
  price_change: { label: "Price change", icon: <Tag />, className: "bg-warn-soft text-warn-strong" },
  visit_change: { label: "Visit change", icon: <CalendarClock />, className: "bg-ok-soft text-ok" },
};

type Filter = "pending" | "all";

export function SuggestionsCard({ className }: { className?: string }) {
  const { data, error, loading, retry, mutate } = useAsync(() => getNightSuggestions("all"), "night-suggestions");
  const [filter, setFilter] = useState<Filter>("pending");
  const [busy, setBusy] = useState<Set<string>>(new Set());
  // Decided while this filter is open: stay visible with their new badge until the filter changes.
  const [justDecided, setJustDecided] = useState<Set<string>>(new Set());

  const pending = data?.filter((s) => s.status === "pending") ?? [];
  const shown = filter === "pending" ? (data ?? []).filter((s) => s.status === "pending" || justDecided.has(s.id)) : (data ?? []);
  const changeFilter = (f: Filter) => {
    setFilter(f);
    setJustDecided(new Set());
  };

  const decide = async (s: Suggestion, decision: "accepted" | "rejected") => {
    // Optimistic: show the decision at once, undo it if the call fails.
    mutate((list) => list.map((x) => (x.id === s.id ? { ...x, status: decision } : x)));
    setJustDecided((d) => new Set(d).add(s.id));
    setBusy((b) => new Set(b).add(s.id));
    try {
      await (decision === "accepted" ? acceptSuggestion(s.id) : rejectSuggestion(s.id));
      toast.success(decision === "accepted" ? "Suggestion accepted" : "Suggestion rejected", {
        description:
          decision === "accepted"
            ? "Recorded for the operator. Nothing changes until someone acts on it."
            : "Recorded. Nothing changes.",
      });
    } catch (e) {
      mutate((list) => list.map((x) => (x.id === s.id ? { ...x, status: "pending" } : x)));
      toast.error("Couldn't save your decision", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy((b) => {
        const next = new Set(b);
        next.delete(s.id);
        return next;
      });
    }
  };

  return (
    <Card className={cn("gap-5 rounded-2xl py-6 shadow-sm [--card-spacing:1.5rem]", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl font-semibold">
          Suggestions from the agent
          {data && (
            <Badge className={cn("h-6 px-2.5 text-sm", pending.length ? "bg-warn text-foreground" : "bg-muted text-muted-foreground")}>
              {pending.length} pending
            </Badge>
          )}
        </CardTitle>
        <CardDescription className="text-base">Ideas beyond tonight&apos;s restock. You decide; the agent never applies them.</CardDescription>
        <CardAction>
          <Segmented
            value={filter}
            onChange={changeFilter}
            options={[
              { value: "pending", label: `Pending${data ? ` (${pending.length})` : ""}` },
              { value: "all", label: `All${data ? ` (${data.length})` : ""}` },
            ]}
          />
        </CardAction>
      </CardHeader>

      <CardContent>
        {error ? (
          <ErrorState error={error} onRetry={retry} />
        ) : loading || !data ? (
          <RowsSkeleton rows={3} />
        ) : shown.length === 0 ? (
          <p className="rounded-xl border border-dashed px-5 py-8 text-center text-base text-muted-foreground">
            No suggestions tonight — the agent found nothing worth changing.
          </p>
        ) : (
          <ul className="space-y-3">
            {shown.map((s) => (
              <SuggestionItem key={s.id} s={s} busy={busy.has(s.id)} onDecide={(d) => decide(s, d)} />
            ))}
          </ul>
        )}
      </CardContent>

      <CardFooter className="border-t pt-4 text-sm text-muted-foreground">
        <ShieldCheck className="mr-2 size-4 shrink-0 text-primary" />
        Accepting only records your decision: prices, stock and orders never change from here.
      </CardFooter>
    </Card>
  );
}

function SuggestionItem({
  s,
  busy,
  onDecide,
}: {
  s: Suggestion;
  busy: boolean;
  onDecide: (d: "accepted" | "rejected") => void;
}) {
  const type = TYPE[s.type];
  return (
    <li
      className={cn(
        "rounded-xl border p-4 transition-colors",
        s.status === "accepted" && "border-ok/40 bg-ok-soft/60",
        s.status === "rejected" && "bg-muted/50 text-muted-foreground",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={cn("h-6 gap-1 px-2.5 text-sm [&>svg]:size-3.5!", type.className)}>
          {type.icon}
          {type.label}
        </Badge>
        <span className="text-base font-medium">{s.machineName}</span>
        <span className="ml-auto text-sm text-muted-foreground">{formatDate(s.runDate)} night</span>
      </div>
      <p className="mt-2 text-lg leading-snug font-bold">{s.suggestion}</p>
      <p className="mt-1 text-base text-muted-foreground">{s.reason}</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-base font-medium">
          <TrendingUp className="size-4 text-ok" aria-hidden />
          {s.expectedEffect}
        </span>
        {s.status === "pending" ? (
          <div className="flex gap-2">
            <Button variant="outline" className="h-10 px-4 text-base" disabled={busy} onClick={() => onDecide("rejected")}>
              <X /> Reject
            </Button>
            <Button className="h-10 px-4 text-base" disabled={busy} onClick={() => onDecide("accepted")}>
              <Check /> Accept
            </Button>
          </div>
        ) : (
          <Badge className={cn("h-7 px-3 text-sm", s.status === "accepted" ? "bg-ok text-white" : "bg-muted text-muted-foreground")}>
            {s.status === "accepted" ? "Accepted" : "Rejected"}
          </Badge>
        )}
      </div>
    </li>
  );
}
