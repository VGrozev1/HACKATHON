// Task S3 — the API contract as TypeScript types.
// api.md describes the endpoints; these are the exact JSON shapes they return.
// Frontend (Kalin) and agent (Viktor) import these; backend (Todor) must return them.
// Change a shape here first, tell the others, then change the route.

export type LocationType = "GYM" | "OFFICE" | "HOSPITAL" | "UNIVERSITY" | "OTHER";
export type PaymentType = "CARD" | "CASH" | "MOBILE";
export type OrderStatus =
  | "DRAFT"
  | "AWAITING_APPROVAL"
  | "APPROVED"
  | "SENT"
  | "DELIVERED"
  | "REJECTED";
export type VisitStatus = "PLANNED" | "SENT" | "DONE" | "SKIPPED";
export type AgentRunStatus = "RUNNING" | "SUCCEEDED" | "FAILED";

/** Dates are ISO 8601 strings in UTC; days are "YYYY-MM-DD". Money is € as a number. */
type ISODate = string;
type Day = string;

// ─── GET /api/machines ───────────────────────────────────────────────────────

export interface Alert {
  kind: "OFFLINE" | "ZERO_SALES" | "STOCK_OUT" | "EXPIRING" | "CASH_MISMATCH";
  message: string; // "Slot A1 (Red Bull) is empty since 14:20"
  likelyCause?: string;
}

export interface MachineSummary {
  id: string;
  name: string;
  locationType: LocationType;
  city: string;
  lat: number;
  lng: number;
  online: boolean;
  stockPercent: number; // 0–100, units in machine / total slot capacity
  salesToday: { units: number; revenue: number };
  alerts: Alert[];
}

// ─── GET /api/machines/:id ───────────────────────────────────────────────────

export interface SlotStock {
  slotId: string;
  code: string; // "A1"
  productId: string;
  productName: string;
  capacity: number;
  quantity: number;
  nextExpiry: ISODate | null; // earliest unexpired batch in this slot
  stockOut: boolean; // nothing sellable left
  emptySince: ISODate | null; // when it ran out (last sale or last batch expiring); null if not empty
}

export interface MachineDetail extends MachineSummary {
  address: string | null;
  slots: SlotStock[];
  lastVisit: ISODate | null;
  nextVisit: ISODate | null;
}

// ─── GET /api/machines/:id/sales?days=60 ─────────────────────────────────────

export interface DailySales {
  day: Day;
  units: number;
  revenue: number;
}

export interface MachineSales {
  machineId: string;
  days: DailySales[]; // oldest first
  topProducts: { productId: string; productName: string; units: number }[];
}

// ─── GET /api/machines/:id/forecast ──────────────────────────────────────────

export interface SlotForecast {
  slotId: string;
  productId: string;
  baseline: number; // A5: expected units until next visit (4-week day-of-week average)
  adjusted: number | null; // B4: after weather/holiday adjustment
  reason: string | null; // B4: plain-language reason for the adjustment
}

export interface MachineForecast {
  machineId: string;
  from: Day;
  until: Day; // next planned visit
  slots: SlotForecast[];
  history: { day: Day; forecast: number; actual: number }[]; // forecast vs actual, for C3
}

// ─── GET /api/orders · POST /api/orders/:id/approve ──────────────────────────

export interface PurchaseOrderLine {
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number;
}

export interface PurchaseOrder {
  id: string;
  supplierId: string;
  supplierName: string;
  status: OrderStatus;
  total: number;
  deliveryDate: Day;
  explanation: string;
  lines: PurchaseOrderLine[];
  machineIds: string[]; // machines this order restocks
  agentRunId: string | null;
  rejectionReasons?: string[]; // REJECTED only: why the order guardrail (B5) blocked it
  createdAt: ISODate;
}

// ─── GET /api/visits?date= · POST /api/visits/:id/done ───────────────────────

export interface LoadItem {
  slotId: string;
  productId: string;
  productName: string;
  quantity: number;
  reason: string;
}

export interface Visit {
  id: string;
  date: Day;
  routeOrder: number;
  machineId: string;
  machineName: string;
  status: VisitStatus;
  loadList: LoadItem[];
  doneAt: ISODate | null;
}

// ─── POST /api/agent/run-night · GET /api/agent/runs/:id ─────────────────────

export interface AgentStep {
  at: ISODate;
  type: "thought" | "tool_call" | "tool_result" | "decision" | "error";
  tool?: string;
  input?: unknown;
  output?: unknown;
  text?: string;
}

export interface AgentDecision {
  kind: "order" | "visit" | "forecast_adjustment" | "alert";
  refId?: string; // order or visit id
  summary: string; // "Ordered 24 water for Gym Lozenets"
  reason: string; // "Hot weekend forecast; ran out last Saturday"
}

export interface AgentRun {
  id: string;
  runDate: Day;
  status: AgentRunStatus;
  steps: AgentStep[];
  decisions: AgentDecision[];
  explanation: string | null;
  startedAt: ISODate;
  finishedAt: ISODate | null;
}

export interface RunNightResponse {
  runId: string; // poll GET /api/agent/runs/:id for steps
}

// ─── POST /api/sim/fast-forward?days=7 · GET /api/benchmark ──────────────────

export interface StrategyResult {
  stockOuts: number; // purchases missed because the slot was empty
  expiredUnits: number; // units pulled after expiring
  visits: number; // stocker visits used (same budget for both strategies)
  lostRevenue: number;
  wastedCost: number;
}

export interface Benchmark {
  from: Day;
  until: Day;
  agent: StrategyResult;
  fixedWeeklyOrder: StrategyResult;
  daily: { day: Day; agentStockOuts: number; fixedStockOuts: number }[];
}

export interface FastForwardResponse {
  daysSimulated: number;
  runIds: string[];
  benchmark: Benchmark;
}

// ─── GET /api/suggestions?status= · POST /api/suggestions/:id/accept|reject ──
// Proposed by Kalin (C5/C7) for Viktor's create_suggestion tool (agent/tools.ts uses the
// same shape). Not built yet: needs a Suggestion table and routes (Todor). Accepting or
// rejecting only changes `status`: it never changes prices, stock or orders.

export type SuggestionType = "extra_stock" | "product_swap" | "price_change" | "visit_change";
export type SuggestionStatus = "pending" | "accepted" | "rejected";

export interface Suggestion {
  id: string;
  runDate: Day; // the night that raised it
  type: SuggestionType;
  machineId: string;
  machineName: string;
  product?: string; // product name, when the suggestion is about one
  suggestion: string; // "Load 2× water at Gym Lozenets"
  reason: string; // the data behind it
  expectedEffect: string; // "≈ 60 more bottles sold, no Saturday stock-out"
  status: SuggestionStatus;
}

// ─── GET /api/investors/:id/statement?month=2026-10 ──────────────────────────

export interface InvestorStatement {
  investorId: string;
  investorName: string;
  machineId: string;
  month: string; // "2026-10"
  payoutModel: "A" | "B" | "C";
  revenue: number;
  costOfGoods: number;
  operatingCosts: number;
  profit: number;
  payout: number;
  daily: DailySales[];
}

// ─── Errors (any endpoint) ───────────────────────────────────────────────────

export interface ApiError {
  error: string;
}
