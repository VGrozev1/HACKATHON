// The frontend's only data source (Kalin, C1–C7). Every screen calls these functions,
// never the mocks directly, so switching to the real backend is a config change:
//
//   NEXT_PUBLIC_USE_MOCK=false             use the real endpoints (default: mocks)
//   NEXT_PUBLIC_API_BASE_URL=https://...   where they live (default: this app's own /api)
//
// Real mode speaks the team contract (src/lib/api-types.ts, api.md) and converts it
// into the view models in src/types.ts, so screens never see backend shapes.

import type * as Contract from "@/lib/api-types";
import type {
  AgentSuggestion,
  ProfitWeek,
  SuggestionStatus,
  AgentRun,
  AgentStep,
  AgentStepType,
  Alert,
  BenchmarkResult,
  ForecastPoint,
  InvestorStatement,
  LocationType,
  Machine,
  OrderStatus,
  PurchaseOrder,
  SalesPoint,
  Slot,
  Visit,
} from "@/types";
import { addDays, DEMO_NOW, dayKey } from "@/lib/format";
import { alertsFor, machineSeedById, machineSeeds, slotsFor, stockPercentFor } from "@/mocks/ui/fleet";
import { forecastFor, salesFor } from "@/mocks/ui/sales";
import { pastOrders, tonightsOrders } from "@/mocks/ui/orders";
import { agentScript, agentSummary, tonightsRoute } from "@/mocks/ui/agent";
import { benchmarkResult, investorStatementFor } from "@/mocks/ui/investor";
import { profitWeeksFor, suggestionsFor } from "@/mocks/ui/owner";

export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== "false";
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Mock latency, so loading skeletons are visible but never slow the demo down. */
const latency = () => sleep(250 + Math.random() * 250);

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as Contract.ApiError;
      if (body.error) message = body.error;
    } catch {
      // not JSON; keep the status text
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

// ─── Mock state (lives for the browser session) ──────────────────────────────

let mockOrders: PurchaseOrder[] = [...pastOrders];

function mockMachine(id: string): Machine {
  const seed = machineSeedById.get(id);
  if (!seed) throw new Error(`Machine ${id} not found`);
  const today = salesFor(id, 1)[0];
  return {
    id: seed.id,
    name: seed.name,
    locationType: seed.locationType,
    city: "Sofia",
    lat: seed.lat,
    lng: seed.lng,
    stockPercent: stockPercentFor(id),
    todaySales: today?.units ?? 0,
    todayRevenue: today?.revenue ?? 0,
    alerts: alertsFor(id),
    status: seed.status === "offline" ? "offline" : "online",
  };
}

// ─── Contract → view model ───────────────────────────────────────────────────

const toLocationType = (t: Contract.LocationType): LocationType =>
  t === "UNIVERSITY" ? "university" :
  t === "GYM" ? "gym" : t === "HOSPITAL" ? "hospital" : "office";

const alertSeverity: Record<Contract.Alert["kind"], Alert["severity"]> = {
  OFFLINE: "critical",
  ZERO_SALES: "critical",
  STOCK_OUT: "warning",
  EXPIRING: "warning",
  CASH_MISMATCH: "warning",
};

function fromMachineSummary(m: Contract.MachineSummary): Machine {
  return {
    id: m.id,
    name: m.name,
    locationType: toLocationType(m.locationType),
    city: m.city,
    lat: m.lat,
    lng: m.lng,
    stockPercent: m.stockPercent,
    todaySales: m.salesToday.units,
    todayRevenue: m.salesToday.revenue,
    status: m.online ? "online" : "offline",
    alerts: m.alerts.map((a, i) => ({
      id: `${m.id}-alert-${i}`,
      machineId: m.id,
      severity: alertSeverity[a.kind] ?? "info",
      title: a.message,
      likelyCause: a.likelyCause ?? "",
    })),
  };
}

const orderStatus: Record<Contract.OrderStatus, OrderStatus> = {
  DRAFT: "waiting_for_approval",
  AWAITING_APPROVAL: "waiting_for_approval",
  APPROVED: "approved",
  SENT: "sent_automatically",
  DELIVERED: "sent_automatically",
  REJECTED: "rejected",
};

function fromOrder(o: Contract.PurchaseOrder): PurchaseOrder {
  return {
    id: o.id,
    supplier: o.supplierName,
    createdAt: o.createdAt,
    deliveryDate: o.deliveryDate,
    total: o.total,
    status: orderStatus[o.status],
    lines: o.lines.map((l) => ({ product: l.productName, quantity: l.quantity, unitCost: l.unitCost })),
    machineIds: o.machineIds,
    explanation: o.explanation,
  };
}

function fromVisit(v: Contract.Visit): Visit {
  return {
    id: v.id,
    order: v.routeOrder,
    machineId: v.machineId,
    machineName: v.machineName,
    loadList: v.loadList.map((l) => ({ product: l.productName, quantity: l.quantity })),
    done: v.status === "DONE",
  };
}

/** Short, human-readable summary of a tool's input or output: never raw JSON on screen. */
function describe(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .slice(0, 4)
      .map(([k, v]) => `${k.replace(/_/g, " ")}: ${Array.isArray(v) ? `${v.length} items` : typeof v === "object" && v ? "…" : String(v)}`)
      .join(" · ");
  }
  return undefined;
}

const stepType: Record<Contract.AgentStep["type"], AgentStepType> = {
  thought: "thinking",
  tool_call: "tool_call",
  tool_result: "tool_result",
  decision: "decision",
  error: "guardrail",
};

function fromStep(s: Contract.AgentStep, i: number): AgentStep {
  const type = stepType[s.type];
  const fallbackTitle =
    type === "tool_call" ? `Calling ${s.tool}` : type === "tool_result" ? `${s.tool} returned` : "Step";
  return {
    id: `step-${i}`,
    timestamp: s.at,
    type,
    tool: s.tool,
    title: s.text ?? fallbackTitle,
    detail: type === "tool_call" ? describe(s.input) : describe(s.output),
  };
}

// ─── Backup data ─────────────────────────────────────────────────────────────
// In real mode, a failed call falls back to the mock data so the live demo never breaks.
// The app shell subscribes to this and shows a "Using backup data" badge.

let usingBackup = false;
const backupListeners = new Set<() => void>();

export function subscribeBackup(listener: () => void) {
  backupListeners.add(listener);
  return () => backupListeners.delete(listener);
}
export const isUsingBackup = () => usingBackup;

/** Thrown to skip the fallback, e.g. when a run failed after its steps were already on screen. */
class NoBackupError extends Error {
  constructor(public readonly cause: unknown) {
    super("no backup");
  }
}

async function withBackup<T>(what: string, real: () => Promise<T>, backup: () => Promise<T>): Promise<T> {
  if (USE_MOCK) return backup();
  try {
    return await real();
  } catch (e) {
    if (e instanceof NoBackupError) throw e.cause;
    console.warn(`[api] ${what} failed, using backup data:`, e);
    if (!usingBackup) {
      usingBackup = true;
      backupListeners.forEach((l) => l());
    }
    return backup();
  }
}

// ─── Fleet ───────────────────────────────────────────────────────────────────

/** GET /api/machines */
export function getMachines(): Promise<Machine[]> {
  return withBackup(
    "getMachines",
    async () => (await http<Contract.MachineSummary[]>("/api/machines")).map(fromMachineSummary),
    async () => {
      await latency();
      return machineSeeds.map((m) => mockMachine(m.id));
    },
  );
}

/** GET /api/machines/:id */
export function getMachine(id: string): Promise<Machine> {
  return withBackup(
    "getMachine",
    async () => fromMachineSummary(await http<Contract.MachineDetail>(`/api/machines/${encodeURIComponent(id)}`)),
    async () => {
      await latency();
      return mockMachine(id);
    },
  );
}

/** GET /api/machines/:id/sales?days=60 */
export function getSales(id: string, days = 60): Promise<SalesPoint[]> {
  return withBackup(
    "getSales",
    async () => {
      const res = await http<Contract.MachineSales>(`/api/machines/${encodeURIComponent(id)}/sales?days=${days}`);
      return res.days.map((d) => ({ date: d.day, units: d.units, revenue: d.revenue }));
    },
    async () => {
      await latency();
      return salesFor(id, days);
    },
  );
}

/** Stock per slot. The contract serves it inside GET /api/machines/:id (`slots`). */
export function getStock(id: string): Promise<Slot[]> {
  return withBackup(
    "getStock",
    async () => {
      const res = await http<Contract.MachineDetail>(`/api/machines/${encodeURIComponent(id)}`);
      return res.slots.map((s) => ({
        id: s.slotId,
        machineId: id,
        product: { id: s.productId, name: s.productName, cost: 0, price: 0, shelfLifeDays: 0 },
        capacity: s.capacity,
        quantity: s.quantity,
        expiryDate: s.nextExpiry ?? "",
      }));
    },
    async () => {
      await latency();
      return slotsFor(id);
    },
  );
}

/** GET /api/machines/:id/forecast */
export function getForecast(id: string): Promise<ForecastPoint[]> {
  return withBackup(
    "getForecast",
    async () => {
      const res = await http<Contract.MachineForecast>(`/api/machines/${encodeURIComponent(id)}/forecast`);
      return res.history.map((h) => ({ date: h.day, forecast: h.forecast, actual: h.actual }));
    },
    async () => {
      await latency();
      return forecastFor(id);
    },
  );
}

// ─── Orders ──────────────────────────────────────────────────────────────────

/** GET /api/orders */
export function getOrders(): Promise<PurchaseOrder[]> {
  return withBackup(
    "getOrders",
    async () => (await http<Contract.PurchaseOrder[]>("/api/orders")).map(fromOrder),
    async () => {
      await latency();
      return [...mockOrders].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    },
  );
}

/** POST /api/orders/:id/approve */
export function approveOrder(id: string): Promise<PurchaseOrder> {
  return withBackup(
    "approveOrder",
    async () =>
      fromOrder(await http<Contract.PurchaseOrder>(`/api/orders/${encodeURIComponent(id)}/approve`, { method: "POST" })),
    async () => {
      await sleep(600);
      const found = mockOrders.find((o) => o.id === id);
      if (!found) throw new Error(`Order ${id} not found`);
      const updated: PurchaseOrder = { ...found, status: "approved" };
      mockOrders = mockOrders.map((o) => (o.id === id ? updated : o));
      return updated;
    },
  );
}

// ─── Agent ───────────────────────────────────────────────────────────────────

/**
 * POST /api/agent/run-night, then follow the run (GET /api/agent/runs/:id once a second)
 * and hand each new step to `onStep` as it arrives. Resolves with the finished run.
 * Falls back to the scripted run only if nothing has streamed yet, so steps never repeat.
 */
export function runNight(onStep: (s: AgentStep) => void): Promise<AgentRun> {
  let streamed = 0;
  const counting = (s: AgentStep) => {
    streamed++;
    onStep(s);
  };
  return withBackup(
    "runNight",
    async () => {
      try {
        return await realRunNight(counting);
      } catch (e) {
        // A run that failed halfway shows its error instead of restarting from the script.
        throw streamed > 0 ? new NoBackupError(e) : e;
      }
    },
    () => mockRunNight(onStep),
  );
}

async function realRunNight(onStep: (s: AgentStep) => void): Promise<AgentRun> {
  const { runId } = await http<Contract.RunNightResponse>("/api/agent/run-night", { method: "POST" });
  let seen = 0;
  let run: Contract.AgentRun;
  const started = Date.now();
  for (;;) {
    run = await http<Contract.AgentRun>(`/api/agent/runs/${encodeURIComponent(runId)}`);
    run.steps.slice(seen).forEach((s, i) => onStep(fromStep(s, seen + i)));
    seen = run.steps.length;
    if (run.status !== "RUNNING") break;
    if (Date.now() - started > 5 * 60_000) throw new Error("The agent is taking longer than 5 minutes");
    await sleep(1000);
  }
  if (run.status === "FAILED") throw new Error(run.explanation ?? "The agent run failed");

  const tomorrow = addDays(run.runDate, 1);
  const [orders, visits] = await Promise.all([
    http<Contract.PurchaseOrder[]>("/api/orders"),
    http<Contract.Visit[]>(`/api/visits?date=${tomorrow}`),
  ]);
  return {
    id: run.id,
    date: run.runDate,
    steps: run.steps.map(fromStep),
    orders: orders.filter((o) => o.agentRunId === run.id).map(fromOrder),
    route: visits.map(fromVisit).sort((a, b) => a.order - b.order),
    summary: run.explanation ?? run.decisions.map((d) => d.summary).join(". "),
  };
}

async function mockRunNight(onStep: (s: AgentStep) => void): Promise<AgentRun> {
  const steps: AgentStep[] = [];
  const start = Date.now();
  for (const [i, seed] of agentScript.entries()) {
    await sleep(600 + Math.random() * 300);
    // Timestamps read as tonight at 22:00 Sofia time, advancing with the real elapsed time.
    const at = new Date(Date.UTC(2026, 9, 10, 19, 0, 0) + (Date.now() - start));
    const step: AgentStep = { ...seed, id: `step-${i + 1}`, timestamp: at.toISOString() };
    steps.push(step);
    onStep(step);
  }
  const orders = tonightsOrders();
  mockOrders = [...orders, ...mockOrders.filter((o) => !orders.some((n) => n.id === o.id))];
  return {
    id: "run-2026-10-10",
    date: dayKey(DEMO_NOW),
    steps,
    orders,
    route: tonightsRoute,
    summary: agentSummary,
  };
}

// ─── Simulation ──────────────────────────────────────────────────────────────

/** POST /api/sim/fast-forward?days=7 */
export function fastForward(days = 7): Promise<BenchmarkResult> {
  return withBackup(
    "fastForward",
    async () => {
      const res = await http<Contract.FastForwardResponse>(`/api/sim/fast-forward?days=${days}`, { method: "POST" });
      const b = res.benchmark;
      return {
        days: res.daysSimulated,
        // The contract reports lost revenue rather than revenue; screens hide revenue when it's 0.
        agent: { stockOuts: b.agent.stockOuts, expiredProducts: b.agent.expiredUnits, revenue: 0 },
        fixedOrder: { stockOuts: b.fixedWeeklyOrder.stockOuts, expiredProducts: b.fixedWeeklyOrder.expiredUnits, revenue: 0 },
        daily: b.daily.map((d) => ({ date: d.day, agentStockOuts: d.agentStockOuts, fixedStockOuts: d.fixedStockOuts })),
      };
    },
    async () => {
      await sleep(4000);
      return benchmarkResult;
    },
  );
}

// ─── Investor ────────────────────────────────────────────────────────────────

/**
 * GET /api/investor/:machineId?model=A
 * Not in api.md yet: the contract has GET /api/investors/:id/statement (by investor).
 * Todor needs to add this per-machine route, or this function maps the other one.
 */
export function getInvestorStatement(machineId: string, model: "A" | "B" | "C"): Promise<InvestorStatement> {
  return withBackup(
    "getInvestorStatement",
    () => http<InvestorStatement>(`/api/investor/${encodeURIComponent(machineId)}?model=${model}`),
    async () => {
      await latency();
      if (!machineSeedById.has(machineId)) throw new Error(`Machine ${machineId} not found`);
      return investorStatementFor(machineId, model);
    },
  );
}

// ─── Owner portal ────────────────────────────────────────────────────────────
// Not in api.md yet: needs GET /api/machines/:id/profit, GET /api/machines/:id/suggestions
// and POST /api/suggestions/:id (Todor / Viktor). Until then both modes use the mocks.

const suggestionStatus = new Map<string, SuggestionStatus>();

/** Weekly revenue, costs and profit for one machine, last 8 weeks. */
export async function getProfitHistory(machineId: string): Promise<ProfitWeek[]> {
  await latency();
  if (!machineSeedById.has(machineId)) throw new Error(`Machine ${machineId} not found`);
  return profitWeeksFor(machineId);
}

/** What the agent suggests to this machine's owner: prices, swaps, visits, repairs. */
export async function getSuggestions(machineId: string): Promise<AgentSuggestion[]> {
  await latency();
  return suggestionsFor(machineId).map((s) => ({ ...s, status: suggestionStatus.get(s.id) ?? s.status }));
}

/** The owner accepts or dismisses a suggestion; accepted ones go to the operator and the agent. */
export async function respondToSuggestion(id: string, status: Exclude<SuggestionStatus, "open">): Promise<void> {
  await sleep(500);
  suggestionStatus.set(id, status);
}
