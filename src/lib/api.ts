// The frontend's only data source (Kalin, C1–C7). Every screen calls these functions,
// never the mocks directly, so switching between real and mock data is one setting:
//
//   NEXT_PUBLIC_USE_MOCK=true              use the built-in mocks (default: Todor's real API)
//   NEXT_PUBLIC_API_BASE_URL=https://...   where they live (default: this app's own /api)
//   NEXT_PUBLIC_AGENT_LIVE=true            use the real agent run for Run night (once B1 is live)
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
  Suggestion,
  Visit,
} from "@/types";
import { addDays, DEMO_NOW, dayKey } from "@/lib/format";
import { alertsFor, machineSeedById, machineSeeds, slotsFor, stockPercentFor } from "@/mocks/ui/fleet";
import { forecastFor, salesFor } from "@/mocks/ui/sales";
import { pastOrders, tonightsOrders } from "@/mocks/ui/orders";
import { agentScript, agentSummary, tonightsRoute } from "@/mocks/ui/agent";
import { benchmarkResult } from "@/mocks/ui/investor";
import { mockSuggestions } from "@/mocks/ui/suggestions";
import { profitWeeksFromSales, statementFromSales, suggestionsFrom } from "@/lib/insights";

// Real API by default; any failed call falls back to the mocks (see withBackup).
export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "true";
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
/** The real agent run endpoints (Viktor, B1) are live. Until then Run night uses the scripted run. */
export const AGENT_LIVE = !USE_MOCK && process.env.NEXT_PUBLIC_AGENT_LIVE === "true";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Mock latency, so loading skeletons are visible but never slow the demo down. */
const latency = () => sleep(250 + Math.random() * 250);

/** A dead API must not stall the demo: every call gives up after `timeoutMs`. */
async function http<T>(path: string, init?: RequestInit, timeoutMs = 8000): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    signal: AbortSignal.timeout(timeoutMs),
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
    rejectionReasons: o.rejectionReasons,
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

/** Plain-language names for Viktor's agent tools (agent/tools.ts). */
const TOOL_LABEL: Record<string, string> = {
  list_machines: "Listing the machines",
  get_stock: "Reading stock",
  forecast: "Forecasting demand",
  plan_route: "Planning the route",
  create_purchase_order: "Placing a purchase order",
  notify_stocker: "Sending load lists to the stocker",
  get_weather: "Checking the weather",
  get_holidays: "Checking public holidays",
  check_alerts: "Checking for alerts",
  create_suggestion: "Raising a suggestion",
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const num = (v: unknown) => (typeof v === "number" ? v : undefined);
const eur = (n: number) => `€${Math.round(n)}`;

function describeInput(tool: string | undefined, input: unknown): string | undefined {
  if (!isObj(input)) return describe(input);
  if (tool === "create_purchase_order") {
    const lines = Array.isArray(input.lines) ? input.lines.length : undefined;
    return [str(input.supplier) ?? str(input.supplierId), lines !== undefined ? `${lines} line${lines === 1 ? "" : "s"}` : undefined].filter(Boolean).join(": ");
  }
  const machine = str(input.machineId) ?? str(input.machine_id);
  if (machine) return machine;
  return describe(input);
}

/** Turns one tool output into a readable card: orders and suggestions become decisions or guardrails. */
function resultStep(id: string, at: string, tool: string | undefined, output: unknown, isError: boolean): AgentStep {
  const base = { id, timestamp: at, tool };
  if (isObj(output) && (isError || str(output.error))) {
    return { ...base, type: "guardrail", title: `${TOOL_LABEL[tool ?? ""] ?? tool} failed`, detail: str(output.error) };
  }
  if (isObj(output) && str(output.status) && (num(output.totalEur) ?? num(output.total)) !== undefined) {
    const total = eur((num(output.totalEur) ?? num(output.total))!);
    const supplier = str(output.supplier) ?? str(output.supplierName) ?? "the supplier";
    const reasons = Array.isArray(output.reasons) ? output.reasons.filter((r): r is string => typeof r === "string") : [];
    const status = str(output.status)!.toLowerCase();
    if (status === "rejected") {
      return { ...base, type: "guardrail", title: `Order ${total} to ${supplier} rejected${reasons[0] ? `: ${reasons[0]}` : ""}`, detail: reasons.slice(1).join(" ") || undefined };
    }
    if (status === "awaiting_approval") {
      return { ...base, type: "guardrail", title: `Order ${total} to ${supplier} exceeds the €300 limit: waiting for approval`, detail: str(output.reason) };
    }
    return { ...base, type: "decision", title: `Ordered ${total} from ${supplier}: sent automatically`, detail: str(output.reason) };
  }
  if (isObj(output) && str(output.suggestion)) {
    return { ...base, type: "decision", title: `Suggestion for ${str(output.machineName) ?? str(output.machineId)}: ${str(output.suggestion)}`, detail: str(output.reason) };
  }
  return { ...base, type: "tool_result", title: `${TOOL_LABEL[tool ?? ""] ?? tool ?? "Step"}: done`, detail: describe(output) };
}

/**
 * One contract step → one or two screen steps. A tool_call that already carries its
 * output (how Viktor's runNight() reports steps) becomes the call plus its result card.
 */
function fromStep(s: Contract.AgentStep, i: number): AgentStep[] {
  const id = `step-${i}`;
  switch (s.type) {
    case "thought":
      return [{ id, timestamp: s.at, type: "thinking", title: s.text ?? "Thinking" }];
    case "decision":
      return [{ id, timestamp: s.at, type: "decision", title: s.text ?? "Decision" }];
    case "error":
      // Viktor's runs route reports a failed tool as { type: "error", tool, output: { error } }.
      if (s.tool && !s.text) return [resultStep(id, s.at, s.tool, s.output, true)];
      return [{ id, timestamp: s.at, type: "guardrail", title: s.text ?? "Something went wrong", detail: describe(s.output) }];
    case "tool_result":
      return [resultStep(id, s.at, s.tool, s.output, false)];
    case "tool_call": {
      const call: AgentStep = {
        id,
        timestamp: s.at,
        type: "tool_call",
        tool: s.tool,
        title: s.text ?? TOOL_LABEL[s.tool ?? ""] ?? `Calling ${s.tool}`,
        detail: describeInput(s.tool, s.input),
      };
      return s.output === undefined ? [call] : [call, resultStep(`${id}-r`, s.at, s.tool, s.output, false)];
    }
  }
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

/** After a failure, use backup data for a while instead of waiting on a dead API every call. */
const COOLDOWN_MS = 30_000;
let backupUntil = 0;

function setUsingBackup(value: boolean) {
  if (usingBackup === value) return;
  usingBackup = value;
  backupListeners.forEach((l) => l());
}

async function withBackup<T>(what: string, real: () => Promise<T>, backup: () => Promise<T>): Promise<T> {
  if (USE_MOCK) return backup();
  if (Date.now() < backupUntil) return backup();
  try {
    const result = await real();
    setUsingBackup(false);
    return result;
  } catch (e) {
    if (e instanceof NoBackupError) throw e.cause;
    console.warn(`[api] ${what} failed, using backup data:`, e);
    backupUntil = Date.now() + COOLDOWN_MS;
    setUsingBackup(true);
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
 * Until Viktor's agent (B1) replaces the stub endpoints, the scripted run is used even in
 * real mode; set NEXT_PUBLIC_AGENT_LIVE=true once it's live.
 */
export function runNight(onStep: (s: AgentStep) => void): Promise<AgentRun> {
  if (!AGENT_LIVE) return mockRunNight(onStep);
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
    run.steps.slice(seen).forEach((s, i) => fromStep(s, seen + i).forEach(onStep));
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
    steps: run.steps.flatMap(fromStep),
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
function fromBenchmark(b: Contract.Benchmark): BenchmarkResult {
  // The contract reports lost revenue rather than revenue; screens hide revenue when it's 0.
  const totals = (r: Contract.StrategyResult) => ({
    stockOuts: r.stockOuts,
    expiredProducts: r.expiredUnits,
    revenue: 0,
    lostRevenue: r.lostRevenue,
    wastedCost: r.wastedCost,
  });
  return {
    days: b.daily.length,
    agent: totals(b.agent),
    fixedOrder: totals(b.fixedWeeklyOrder),
    daily: b.daily.map((d) => ({ date: d.day, agentStockOuts: d.agentStockOuts, fixedStockOuts: d.fixedStockOuts })),
  };
}

/**
 * POST /api/sim/fast-forward?days=7, then GET /api/benchmark for the result (A8): the
 * agent against a fixed weekly order on the same simulated demand. Falls back to the
 * benchmark in the fast-forward response if the second call fails.
 */
export function fastForward(days = 7): Promise<BenchmarkResult> {
  return withBackup(
    "fastForward",
    async () => {
      // ~2–4 s per simulated day (api.md), so this call gets a long timeout.
      const res = await http<Contract.FastForwardResponse>(`/api/sim/fast-forward?days=${days}`, { method: "POST" }, 90_000);
      const b = await http<Contract.Benchmark>("/api/benchmark").catch(() => res.benchmark);
      return fromBenchmark(b);
    },
    async () => {
      await sleep(4000);
      return benchmarkResult;
    },
  );
}

/** GET /api/benchmark: the last fast-forward's result, or a dry run of the next 7 days. */
export function getBenchmark(): Promise<BenchmarkResult> {
  return withBackup(
    "getBenchmark",
    async () => fromBenchmark(await http<Contract.Benchmark>("/api/benchmark")),
    async () => {
      await latency();
      return benchmarkResult;
    },
  );
}

// ─── Investor and owner portal ───────────────────────────────────────────────
// Computed here from the machine's sales and stock (src/lib/insights.ts), so they work
// on the real API without extra endpoints. Todor's GET /api/investors/:id/statement is
// keyed by investor and covers only their first machine, so the per-machine pages
// don't use it.

/** One machine's statement for last month, under payout model A, B or C. */
export async function getInvestorStatement(machineId: string, model: "A" | "B" | "C", value?: number): Promise<InvestorStatement> {
  return statementFromSales(machineId, await getSales(machineId, 60), model, undefined, value);
}

/** Weekly sales, costs and profit for one machine, last 8 weeks. */
export async function getProfitHistory(machineId: string): Promise<ProfitWeek[]> {
  return profitWeeksFromSales(await getSales(machineId, 60));
}

// The owner's answers live in the browser for now; the agent reading them needs a
// backend endpoint (Viktor), e.g. POST /api/suggestions/:id { status }.
const suggestionStatus = new Map<string, SuggestionStatus>();

/** What the agent suggests to this machine's owner: prices, swaps, visits, repairs. */
export async function getSuggestions(machineId: string): Promise<AgentSuggestion[]> {
  const [machine, slots, sales] = await Promise.all([getMachine(machineId), getStock(machineId), getSales(machineId, 28)]);
  return suggestionsFrom({ machine, slots, sales }).map((s) => ({ ...s, status: suggestionStatus.get(s.id) ?? s.status }));
}

/** The owner accepts or dismisses a suggestion; accepted ones go to the operator and the agent. */
export async function respondToSuggestion(id: string, status: Exclude<SuggestionStatus, "open">): Promise<void> {
  await sleep(500);
  suggestionStatus.set(id, status);
}

/** Contract steps → readable screen steps (exported for tests and for Viktor to check his output). */
export const screenSteps = (steps: Contract.AgentStep[]): AgentStep[] => steps.flatMap(fromStep);

// ─── Agent suggestions ───────────────────────────────────────────────────────
// GET /api/suggestions, POST /api/suggestions/:id/accept|reject (proposed; see
// api-types.ts). They come from Viktor's agent, so they follow AGENT_LIVE: until the
// agent writes them to the database, both modes use the mocks.

let mockSuggestionState: Suggestion[] = mockSuggestions.map((s) => ({ ...s }));

/** The agent's suggestions, newest night first; `pending` only, or all. */
export async function getNightSuggestions(status: "pending" | "all" = "all"): Promise<Suggestion[]> {
  const list = AGENT_LIVE
    ? await withBackup(
        "getNightSuggestions",
        () => http<Suggestion[]>(`/api/suggestions${status === "pending" ? "?status=pending" : ""}`),
        async () => mockSuggestionState,
      )
    : (await latency(), mockSuggestionState);
  return list
    .filter((s) => status === "all" || s.status === "pending")
    .sort((a, b) => b.runDate.localeCompare(a.runDate));
}

async function decideSuggestion(id: string, decision: "accept" | "reject"): Promise<Suggestion> {
  const status = decision === "accept" ? "accepted" : "rejected";
  const local = async () => {
    await sleep(500);
    const found = mockSuggestionState.find((s) => s.id === id);
    if (!found) throw new Error(`Suggestion ${id} not found`);
    const updated = { ...found, status } as Suggestion;
    mockSuggestionState = mockSuggestionState.map((s) => (s.id === id ? updated : s));
    return updated;
  };
  if (!AGENT_LIVE) return local();
  return withBackup("decideSuggestion", () => http<Suggestion>(`/api/suggestions/${encodeURIComponent(id)}/${decision}`, { method: "POST" }), local);
}

/** Accepting only records the decision: it never changes prices, stock or orders. */
export const acceptSuggestion = (id: string) => decideSuggestion(id, "accept");
export const rejectSuggestion = (id: string) => decideSuggestion(id, "reject");
