"use client";

// C5: purchase orders and approvals. Table, side sheet per order, approve after a
// confirmation step, rejected orders with the guardrail's reasons.

import Link from "next/link";
import { useState } from "react";
import { Check, Info, Loader2, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { OrderStatus, PurchaseOrder } from "@/types";
import { approveOrder, getMachines, getOrders } from "@/lib/api";
import { formatDate, formatEUR, formatTime } from "@/lib/format";
import { useAsync } from "@/hooks/use-async";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/states";
import { Chip } from "@/components/controls";
import { OrderStatusBadge, orderStatusMeta, orderStatusRank, RejectionReasons } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const FILTERS: (OrderStatus | "all")[] = ["all", "waiting_for_approval", "sent_automatically", "approved", "rejected"];

export function OrdersView() {
  const { data: orders, error, loading, retry, mutate } = useAsync(getOrders, "orders");
  const [openId, setOpenId] = useState<string | null>(null);
  const [approving, setApproving] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [confirming, setConfirming] = useState<PurchaseOrder | null>(null);
  const machines = useAsync(getMachines, "machines");
  const names = new Map(machines.data?.map((m) => [m.id, m.name]) ?? []);

  const open = orders?.find((o) => o.id === openId) ?? null;
  // Awaiting approval first, rejected last; newest first within each.
  const visible = (orders?.filter((o) => filter === "all" || o.status === filter) ?? []).sort(
    (a, b) => orderStatusRank[a.status] - orderStatusRank[b.status] || b.createdAt.localeCompare(a.createdAt),
  );
  const waiting = orders?.filter((o) => o.status === "waiting_for_approval") ?? [];

  const approve = async (order: PurchaseOrder) => {
    setApproving((s) => new Set(s).add(order.id));
    try {
      const updated = await approveOrder(order.id);
      mutate((list) => list.map((o) => (o.id === updated.id ? updated : o)));
      toast.success(`${order.id} approved`, {
        description: `${formatEUR(order.total)} to ${order.supplier}. The supplier email goes out now.`,
      });
    } catch (e) {
      toast.error(`Couldn't approve ${order.id}`, { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setApproving((s) => {
        const next = new Set(s);
        next.delete(order.id);
        return next;
      });
    }
  };

  return (
    <>
      <PageHeader
        title="Orders and approvals"
        description="Every purchase order the agent created, with its reasoning."
      />

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-primary/25 bg-accent px-5 py-3.5 text-base text-accent-foreground">
        <Info className="size-5 shrink-0" aria-hidden />
        <span>
          <b>Orders under €300 are sent automatically; larger orders need approval.</b> The limit is enforced in code, not
          just in the agent&apos;s instructions.
        </span>
        {waiting.length > 0 && (
          <span className="ml-auto rounded-full bg-warn-soft px-3 py-1 text-sm font-semibold text-warn-strong ring-1 ring-warn/40">
            {waiting.length} waiting for approval
          </span>
        )}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={retry} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
            {FILTERS.map((f) => (
              <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
                {f === "all" ? "All" : orderStatusMeta[f].label}
                {orders && (
                  <span className="text-current/60">{f === "all" ? orders.length : orders.filter((o) => o.status === f).length}</span>
                )}
              </Chip>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            {loading ? (
              <RowsSkeleton rows={8} className="p-5" />
            ) : visible.length === 0 ? (
              <EmptyState
                className="m-5"
                title={orders?.length ? "No orders with this status" : "No purchase orders yet"}
                description={orders?.length ? "Pick another filter." : "Run tonight's agent to create the first orders."}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-base">
                  <thead className="bg-muted/60">
                    <tr className="text-left text-sm text-muted-foreground">
                      <th className="px-4 py-3 font-semibold">Order · supplier</th>
                      <th className="px-4 py-3 font-semibold">Created</th>
                      <th className="px-4 py-3 font-semibold">Delivery</th>
                      <th className="px-4 py-3 text-right font-semibold">Total</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Machines</th>
                      <th className="px-4 py-3">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((o) => (
                      <tr
                        key={o.id}
                        onClick={() => setOpenId(o.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setOpenId(o.id);
                          }
                        }}
                        tabIndex={0}
                        className={cn(
                          "cursor-pointer border-t transition-colors hover:bg-accent/60 focus-visible:bg-accent focus-visible:outline-none",
                          o.status === "waiting_for_approval" && "bg-warn-soft/50",
                          o.status === "rejected" && "text-muted-foreground",
                        )}
                      >
                        <td className="px-4 py-4">
                          <div className="font-semibold">{o.supplier}</div>
                          <div className="font-mono text-sm text-muted-foreground">{o.id}</div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-muted-foreground">
                          {formatDate(o.createdAt)}
                          <div className="text-sm">{formatTime(o.createdAt)}</div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">{formatDate(o.deliveryDate)}</td>
                        <td className="px-4 py-4 text-right font-bold tabular-nums">{formatEUR(o.total)}</td>
                        <td className="max-w-64 px-4 py-4">
                          <OrderStatusBadge status={o.status} />
                          {o.rejectionReasons?.[0] && <p className="mt-1 text-sm leading-snug text-crit">{o.rejectionReasons[0]}</p>}
                        </td>
                        <td className="max-w-48 px-4 py-4">
                          <MachineChips ids={o.machineIds} names={names} max={1} compact />
                        </td>
                        <td className="px-4 py-4 text-right">
                          {o.status === "waiting_for_approval" && (
                            <ApproveButton busy={approving.has(o.id)} onClick={() => setConfirming(o)} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <Sheet open={open !== null} onOpenChange={(v) => !v && setOpenId(null)}>
        <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-xl! data-[side=right]:sm:max-w-xl">
          {open && (
            <>
              <SheetHeader className="border-b p-6">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-semibold text-muted-foreground">{open.id}</span>
                  <OrderStatusBadge status={open.status} />
                </div>
                <SheetTitle className="mt-2 text-2xl font-bold">{open.supplier}</SheetTitle>
                <SheetDescription className="text-base">
                  Created {formatDate(open.createdAt)} at {formatTime(open.createdAt)} · delivery {formatDate(open.deliveryDate)}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-6 p-6">
                <RejectionReasons reasons={open.rejectionReasons} />
                <section className="rounded-xl border-2 border-primary/30 bg-accent/60 p-4">
                  <div className="mb-1.5 flex items-center gap-2 text-sm font-bold tracking-wider text-primary uppercase">
                    <Sparkles className="size-4" /> Why the agent ordered this
                  </div>
                  <p className="text-base leading-relaxed">{open.explanation}</p>
                </section>

                <section>
                  <h3 className="mb-2 text-lg font-semibold">Order lines</h3>
                  <table className="w-full text-base">
                    <thead>
                      <tr className="border-b text-left text-sm text-muted-foreground">
                        <th className="py-2 font-medium">Product</th>
                        <th className="py-2 text-right font-medium">Qty</th>
                        <th className="py-2 text-right font-medium">Unit</th>
                        <th className="py-2 text-right font-medium">Line</th>
                      </tr>
                    </thead>
                    <tbody>
                      {open.lines.map((l) => (
                        <tr key={l.product} className="border-b">
                          <td className="py-2.5">{l.product}</td>
                          <td className="py-2.5 text-right tabular-nums">{l.quantity}</td>
                          <td className="py-2.5 text-right text-muted-foreground tabular-nums">{formatEUR(l.unitCost)}</td>
                          <td className="py-2.5 text-right font-medium tabular-nums">{formatEUR(l.quantity * l.unitCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3} className="pt-3 text-right font-semibold">
                          Total
                        </td>
                        <td className="pt-3 text-right text-xl font-bold tabular-nums">{formatEUR(open.total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </section>

                <section>
                  <h3 className="mb-2 text-lg font-semibold">Restocks these machines</h3>
                  <MachineChips ids={open.machineIds} names={names} />
                </section>

                {open.status === "waiting_for_approval" && (
                  <div className="rounded-xl border border-warn bg-warn-soft p-4">
                    <p className="text-base">
                      This order is over the €300 limit, so the agent is waiting for your approval. The same request went to
                      Telegram.
                    </p>
                    <ApproveButton busy={approving.has(open.id)} onClick={() => setConfirming(open)} large className="mt-3 w-full" />
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirming !== null} onOpenChange={(v) => !v && setConfirming(null)}>
        <AlertDialogContent className="max-w-md! gap-5 p-6">
          {confirming && (
            <>
              <AlertDialogHeader className="place-items-start text-left">
                <AlertDialogTitle className="text-xl font-bold">
                  Approve {formatEUR(confirming.total)} to {confirming.supplier}?
                </AlertDialogTitle>
                <AlertDialogDescription className="text-base text-muted-foreground">
                  The order email goes to the supplier now, for delivery on {formatDate(confirming.deliveryDate)}. You can&apos;t
                  undo this from the dashboard.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <ul className="space-y-1 rounded-lg bg-muted px-4 py-3 text-base">
                {confirming.lines.map((l) => (
                  <li key={l.product} className="flex justify-between gap-4">
                    <span>
                      <b className="tabular-nums">{l.quantity}×</b> {l.product}
                    </span>
                    <span className="text-muted-foreground tabular-nums">{formatEUR(l.quantity * l.unitCost)}</span>
                  </li>
                ))}
              </ul>
              <AlertDialogFooter className="-mx-6 -mb-6 p-4 px-6">
                <AlertDialogCancel className="h-11 px-5 text-base">Cancel</AlertDialogCancel>
                <Button
                  className="h-11 bg-ok px-5 text-base text-white hover:bg-ok/85"
                  onClick={() => {
                    const order = confirming;
                    setConfirming(null);
                    void approve(order);
                  }}
                >
                  <Send /> Approve and send
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ApproveButton({
  busy,
  onClick,
  large,
  className,
}: {
  busy: boolean;
  onClick: () => void;
  large?: boolean;
  className?: string;
}) {
  return (
    <Button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={busy}
      className={cn(large ? "h-12 text-lg" : "h-10 px-4 text-base", "bg-ok text-white hover:bg-ok/85", className)}
    >
      {busy ? <Loader2 className="animate-spin" /> : <Check />}
      {busy ? "Approving…" : "Approve"}
    </Button>
  );
}

function MachineChips({ ids, names, max, compact }: { ids: string[]; names?: Map<string, string>; max?: number; compact?: boolean }) {
  const shown = max ? ids.slice(0, max) : ids;
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((id) => (
        <Link
          key={id}
          href={`/machines/${id}`}
          onClick={(e) => e.stopPropagation()}
          title={id}
          className={cn(
            "rounded-md border bg-card px-2 py-0.5 text-sm font-medium text-foreground hover:border-primary hover:text-primary",
            compact && "max-w-44 truncate whitespace-nowrap",
          )}
        >
          {names?.get(id) ?? id}
        </Link>
      ))}
      {max && ids.length > max && <span className="self-center text-sm text-muted-foreground">+{ids.length - max} more</span>}
    </div>
  );
}
