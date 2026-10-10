// Task A6: the queries behind the dashboard API. Each function returns exactly
// one shape from src/lib/api-types.ts; the routes in src/app/api just call them.

import { db } from "@/lib/db";
import type {
  Alert,
  DailySales,
  InvestorStatement,
  MachineDetail,
  MachineSales,
  MachineSummary,
  PurchaseOrder,
  Visit,
  LoadItem,
} from "@/lib/api-types";
import { addDays, dayOfWeek, dayRange, sofiaTime, type Day } from "@/lib/sim/calendar";
import { cashMismatches } from "./cash";
import { computeBaseline } from "./forecast";
import { getSimToday, simNight } from "./sim-clock";
import { loadStock, machineSlotStock, stockPercentByMachine } from "./stock";
import { sellable } from "@/lib/sim/stock";

const round2 = (n: number) => Math.round(n * 100) / 100;
const dayStart = (day: Day) => sofiaTime(day, 0);
const sofiaHHMM = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/Sofia", hour: "2-digit", minute: "2-digit" });

/** Units and revenue per machine on one Sofia day. */
async function salesOnDay(day: Day) {
  const rows = await db.saleEvent.groupBy({
    by: ["machineId"],
    where: { occurredAt: { gte: dayStart(day), lt: dayStart(addDays(day, 1)) } },
    _count: true,
    _sum: { price: true },
  });
  return new Map(rows.map((r) => [r.machineId, { units: r._count, revenue: round2(r._sum.price ?? 0) }]));
}

// ─── Alerts ──────────────────────────────────────────────────────────────────

/**
 * Data-driven "what's wrong" checks for every machine. Viktor's B8 can add
 * likely causes on top; these are the facts.
 */
async function fleetAlerts(today: Day): Promise<Map<string, Alert[]>> {
  const night = simNight(today);
  const soon = new Date(night.getTime() + 24 * 3600 * 1000);
  const [machines, slots, stock, todaySales, baseline, cash] = await Promise.all([
    db.machine.findMany(),
    db.slot.findMany({ include: { product: true }, orderBy: { code: "asc" } }),
    loadStock(),
    salesOnDay(today),
    computeBaseline(addDays(today, -1)),
    cashMismatches(),
  ]);
  const alerts = new Map<string, Alert[]>(machines.map((m) => [m.id, []]));
  const usualToday = new Map<string, number>();

  for (const slot of slots) {
    const list = alerts.get(slot.machineId)!;
    const batches = stock.get(slot.id) ?? [];
    if (sellable(batches, night) === 0) {
      list.push({ kind: "STOCK_OUT", message: `${slot.code} (${slot.product.name}) is empty` });
    }
    const expiring = batches
      .filter((b) => b.quantity > 0 && b.expiresAt > night && b.expiresAt <= soon)
      .reduce((n, b) => n + b.quantity, 0);
    if (expiring > 0) {
      list.push({ kind: "EXPIRING", message: `${expiring} × ${slot.product.name} in ${slot.code} expire within 24 h` });
    }
    const perDow = baseline.get(slot.id);
    if (perDow) usualToday.set(slot.machineId, (usualToday.get(slot.machineId) ?? 0) + perDow[dayOfWeek(today)]);
  }

  for (const m of machines) {
    const list = alerts.get(m.id)!;
    if (!m.online) list.unshift({ kind: "OFFLINE", message: "Machine is not reporting", likelyCause: "Card reader or modem lost connection" });
    const usual = usualToday.get(m.id) ?? 0;
    if (m.online && !todaySales.get(m.id) && usual >= 10) {
      list.push({ kind: "ZERO_SALES", message: `No sales today; usually about ${Math.round(usual)}`, likelyCause: "Payment system or machine fault" });
    }
    const c = cash.get(m.id);
    if (c) {
      list.push({
        kind: "CASH_MISMATCH",
        message: `Cash box €${c.collected.toFixed(2)} vs fiscal €${c.fiscalCash.toFixed(2)} at last collection`,
        likelyCause: c.likelyCause ?? undefined,
      });
    }
  }
  return alerts;
}

// ─── Machines ────────────────────────────────────────────────────────────────

export async function listMachines(): Promise<MachineSummary[]> {
  const today = await getSimToday();
  const [machines, percent, sales, alerts] = await Promise.all([
    db.machine.findMany({ orderBy: { id: "asc" } }),
    stockPercentByMachine(simNight(today)),
    salesOnDay(today),
    fleetAlerts(today),
  ]);
  return machines.map((m) => ({
    id: m.id,
    name: m.name,
    locationType: m.locationType,
    city: m.city,
    lat: m.lat,
    lng: m.lng,
    online: m.online,
    stockPercent: percent.get(m.id) ?? 0,
    salesToday: sales.get(m.id) ?? { units: 0, revenue: 0 },
    alerts: alerts.get(m.id) ?? [],
  }));
}

export async function getMachine(id: string): Promise<MachineDetail | null> {
  const machine = await db.machine.findUnique({ where: { id } });
  if (!machine) return null;
  const today = await getSimToday();
  const night = simNight(today);
  const [slots, sales, alerts, lastVisit, nextVisit] = await Promise.all([
    machineSlotStock(id, night),
    salesOnDay(today),
    fleetAlerts(today),
    db.visit.findFirst({ where: { machineId: id, status: "DONE" }, orderBy: { doneAt: "desc" } }),
    db.visit.findFirst({ where: { machineId: id, status: { in: ["PLANNED", "SENT"] } }, orderBy: { date: "asc" } }),
  ]);
  const units = slots.reduce((n, s) => n + s.quantity, 0);
  const capacity = slots.reduce((n, s) => n + s.capacity, 0);
  const machineAlerts = (alerts.get(id) ?? []).map((a) =>
    a.kind === "STOCK_OUT" ? withEmptySince(a, slots) : a,
  );
  return {
    id: machine.id,
    name: machine.name,
    locationType: machine.locationType,
    city: machine.city,
    lat: machine.lat,
    lng: machine.lng,
    online: machine.online,
    address: machine.address,
    stockPercent: capacity ? Math.round((100 * units) / capacity) : 0,
    salesToday: sales.get(id) ?? { units: 0, revenue: 0 },
    alerts: machineAlerts,
    slots,
    lastVisit: lastVisit?.doneAt?.toISOString() ?? null,
    nextVisit: nextVisit ? sofiaTime(nextVisit.date.toISOString().slice(0, 10), 7, 30).toISOString() : null,
  };
}

/** "A1 (Devin water) is empty" → "… is empty since 18:10" when we know when. */
function withEmptySince(alert: Alert, slots: MachineDetail["slots"]): Alert {
  const slot = slots.find((s) => alert.message.startsWith(`${s.code} `));
  return slot?.emptySince ? { ...alert, message: `${alert.message} since ${sofiaHHMM(slot.emptySince)}` } : alert;
}

export async function getMachineSales(id: string, days: number): Promise<MachineSales | null> {
  if (!(await db.machine.findUnique({ where: { id }, select: { id: true } }))) return null;
  const today = await getSimToday();
  const from = addDays(today, -(days - 1));
  const range = { gte: dayStart(from), lt: dayStart(addDays(today, 1)) };
  const [daily, top] = await Promise.all([
    db.$queryRaw<{ day: Date; units: number; revenue: number }[]>`
      SELECT ((("occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Sofia')::date) AS day,
             COUNT(*)::int AS units, COALESCE(SUM(price), 0)::float AS revenue
      FROM "SaleEvent"
      WHERE "machineId" = ${id} AND "occurredAt" >= ${range.gte} AND "occurredAt" < ${range.lt}
      GROUP BY 1`,
    db.saleEvent.groupBy({
      by: ["productId"],
      where: { machineId: id, occurredAt: range },
      _count: true,
      orderBy: { _count: { productId: "desc" } },
      take: 5,
    }),
  ]);
  const byDay = new Map(daily.map((d) => [d.day.toISOString().slice(0, 10), d]));
  const products = await db.product.findMany({ where: { id: { in: top.map((t) => t.productId) } } });
  const name = new Map(products.map((p) => [p.id, p.name]));
  return {
    machineId: id,
    days: dayRange(from, today).map((day): DailySales => ({
      day,
      units: byDay.get(day)?.units ?? 0,
      revenue: round2(byDay.get(day)?.revenue ?? 0),
    })),
    topProducts: top.map((t) => ({ productId: t.productId, productName: name.get(t.productId) ?? t.productId, units: t._count })),
  };
}

// ─── Orders ──────────────────────────────────────────────────────────────────

const orderInclude = { supplier: true, lines: { include: { product: true } }, agentRun: { include: { visits: true } } } as const;

type OrderRow = Awaited<ReturnType<typeof db.purchaseOrder.findFirstOrThrow<{ include: typeof orderInclude }>>>;

function toOrderDto(o: OrderRow): PurchaseOrder {
  const productIds = new Set(o.lines.map((l) => l.productId));
  // Machines this order restocks: the run's visits that load any of its products.
  const machineIds = [
    ...new Set(
      (o.agentRun?.visits ?? [])
        .filter((v) => (v.loadList as unknown as LoadItem[]).some((item) => productIds.has(item.productId)))
        .map((v) => v.machineId),
    ),
  ];
  return {
    id: o.id,
    supplierId: o.supplierId,
    supplierName: o.supplier.name,
    status: o.status,
    total: o.total,
    deliveryDate: o.deliveryDate.toISOString().slice(0, 10),
    explanation: o.explanation,
    lines: o.lines.map((l) => ({ productId: l.productId, productName: l.product.name, quantity: l.quantity, unitCost: l.unitCost })),
    machineIds,
    agentRunId: o.agentRunId,
    createdAt: o.createdAt.toISOString(),
  };
}

export async function listOrders(): Promise<PurchaseOrder[]> {
  const orders = await db.purchaseOrder.findMany({ include: orderInclude, orderBy: { createdAt: "desc" }, take: 100 });
  return orders.map(toOrderDto);
}

/** Approve an order waiting for approval. Returns null if missing, or the order unchanged if not awaiting approval. */
export async function approveOrder(id: string, approvedBy = "dashboard"): Promise<PurchaseOrder | null> {
  const order = await db.purchaseOrder.findUnique({ where: { id } });
  if (!order) return null;
  if (order.status === "AWAITING_APPROVAL") {
    await db.purchaseOrder.update({ where: { id }, data: { status: "APPROVED", approvedAt: new Date(), approvedBy } });
  }
  return toOrderDto(await db.purchaseOrder.findUniqueOrThrow({ where: { id }, include: orderInclude }));
}

// ─── Visits ──────────────────────────────────────────────────────────────────

type VisitRow = Awaited<ReturnType<typeof db.visit.findFirstOrThrow<{ include: { machine: true } }>>>;

export function toVisitDto(v: VisitRow): Visit {
  return {
    id: v.id,
    date: v.date.toISOString().slice(0, 10),
    routeOrder: v.routeOrder,
    machineId: v.machineId,
    machineName: v.machine.name,
    status: v.status,
    loadList: v.loadList as unknown as LoadItem[],
    doneAt: v.doneAt?.toISOString() ?? null,
  };
}

/** Visits for a day in route order; without a date, the next day that has any planned. */
export async function listVisits(date?: Day): Promise<Visit[]> {
  let day = date;
  if (!day) {
    const next = await db.visit.findFirst({ where: { status: { in: ["PLANNED", "SENT"] } }, orderBy: { date: "asc" } });
    day = next ? next.date.toISOString().slice(0, 10) : addDays(await getSimToday(), 1);
  }
  const visits = await db.visit.findMany({
    where: { date: new Date(`${day}T00:00:00Z`) },
    include: { machine: true },
    orderBy: { routeOrder: "asc" },
  });
  return visits.map(toVisitDto);
}

// ─── Investors (C7) ──────────────────────────────────────────────────────────

/** Running costs per machine: electricity, telemetry, insurance, plus each restock trip. */
const FIXED_COST_PER_DAY = 3.5;
const COST_PER_VISIT = 9;

export async function investorStatement(investorId: string, month?: string): Promise<InvestorStatement | null> {
  const investor = await db.investor.findUnique({ where: { id: investorId }, include: { machines: true } });
  const machine = investor?.machines.sort((a, b) => a.id.localeCompare(b.id))[0];
  if (!investor || !machine) return null;

  const today = await getSimToday();
  const m = month ?? today.slice(0, 7);
  const first = `${m}-01`;
  const lastOfMonth = addDays(`${addDays(first, 32).slice(0, 7)}-01`, -1);
  const last = lastOfMonth < today ? lastOfMonth : today; // month to date
  const range = { gte: dayStart(first), lt: dayStart(addDays(last, 1)) };

  const [sales, daily, visits] = await Promise.all([
    db.saleEvent.findMany({ where: { machineId: machine.id, occurredAt: range }, select: { price: true, product: { select: { cost: true } } } }),
    db.$queryRaw<{ day: Date; units: number; revenue: number }[]>`
      SELECT ((("occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Sofia')::date) AS day,
             COUNT(*)::int AS units, COALESCE(SUM(price), 0)::float AS revenue
      FROM "SaleEvent"
      WHERE "machineId" = ${machine.id} AND "occurredAt" >= ${range.gte} AND "occurredAt" < ${range.lt}
      GROUP BY 1`,
    db.visit.count({ where: { machineId: machine.id, status: "DONE", doneAt: range } }),
  ]);
  const revenue = round2(sales.reduce((n, s) => n + s.price, 0));
  const costOfGoods = round2(sales.reduce((n, s) => n + s.product.cost, 0));
  const days = first <= last ? dayRange(first, last).length : 0;
  const operatingCosts = round2(days * FIXED_COST_PER_DAY + visits * COST_PER_VISIT);
  const profit = round2(revenue - costOfGoods - operatingCosts);
  const payout = round2(
    investor.payoutModel === "A"
      ? (investor.payoutValue * days) / dayRange(first, lastOfMonth).length // monthly rent, pro rata
      : investor.payoutModel === "B"
        ? revenue * investor.payoutValue
        : Math.max(0, profit) * investor.payoutValue,
  );
  const byDay = new Map(daily.map((d) => [d.day.toISOString().slice(0, 10), d]));
  return {
    investorId: investor.id,
    investorName: investor.name,
    machineId: machine.id,
    month: m,
    payoutModel: investor.payoutModel,
    revenue,
    costOfGoods,
    operatingCosts,
    profit,
    payout,
    daily: days
      ? dayRange(first, last).map((day) => ({ day, units: byDay.get(day)?.units ?? 0, revenue: round2(byDay.get(day)?.revenue ?? 0) }))
      : [],
  };
}
