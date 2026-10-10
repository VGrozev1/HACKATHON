// Frontend view models (Kalin, C1–C7). Every screen renders these shapes.
// They are deliberately simpler than the backend contract in src/lib/api-types.ts;
// src/lib/api.ts converts the contract into these when USE_MOCK is off.

export type LocationType = "gym" | "office" | "hospital" | "university";

export interface Alert {
  id: string;
  machineId: string;
  severity: "info" | "warning" | "critical";
  title: string;
  likelyCause: string;
}

export interface Machine {
  id: string;
  name: string;
  locationType: LocationType;
  city: string;
  lat: number;
  lng: number;
  stockPercent: number;
  todaySales: number;
  todayRevenue: number;
  alerts: Alert[];
  status: "online" | "offline";
}

export interface Product {
  id: string;
  name: string;
  cost: number;
  price: number;
  shelfLifeDays: number;
}

export interface Slot {
  id: string;
  machineId: string;
  product: Product;
  capacity: number;
  quantity: number;
  expiryDate: string;
}

export interface SalesPoint {
  date: string;
  units: number;
  revenue: number;
}

export interface ForecastPoint {
  date: string;
  forecast: number;
  actual: number | null;
}

export type OrderStatus = "sent_automatically" | "waiting_for_approval" | "approved" | "rejected";

export interface PurchaseOrder {
  id: string;
  supplier: string;
  createdAt: string;
  deliveryDate: string;
  total: number;
  status: OrderStatus;
  lines: { product: string; quantity: number; unitCost: number }[];
  machineIds: string[];
  explanation: string;
  /** Why the order guardrail rejected it (rejected orders only). */
  rejectionReasons?: string[];
}

export interface Visit {
  id: string;
  order: number;
  machineId: string;
  machineName: string;
  loadList: { product: string; quantity: number }[];
  done: boolean;
}

export type AgentStepType = "thinking" | "tool_call" | "tool_result" | "decision" | "guardrail" | "done";

export interface AgentStep {
  id: string;
  timestamp: string;
  type: AgentStepType;
  tool?: string;
  title: string;
  detail?: string;
}

export interface AgentRun {
  id: string;
  date: string;
  steps: AgentStep[];
  orders: PurchaseOrder[];
  route: Visit[];
  summary: string;
}

export interface BenchmarkResult {
  days: number;
  agent: { stockOuts: number; expiredProducts: number; revenue: number };
  fixedOrder: { stockOuts: number; expiredProducts: number; revenue: number };
  daily: { date: string; agentStockOuts: number; fixedStockOuts: number }[];
}

export interface InvestorStatement {
  machineId: string;
  month: string;
  sales: number;
  costs: number;
  payoutModel: "A" | "B" | "C";
  payout: number;
  lines: { label: string; amount: number }[];
}

// ─── Owner portal ────────────────────────────────────────────────────────────

export interface ProfitWeek {
  weekStart: string; // Monday, "YYYY-MM-DD"
  revenue: number;
  costs: number;
  profit: number;
}

export type SuggestionKind = "price" | "swap" | "restock" | "service";
export type SuggestionStatus = "open" | "accepted" | "dismissed";

/** Something the agent recommends to a machine's owner. Never applied without their OK. */
export interface AgentSuggestion {
  id: string;
  machineId: string;
  kind: SuggestionKind;
  title: string; // "Raise Devin water to €1.40"
  reason: string; // why, in plain language
  impactPerMonth: number; // expected extra profit, €
  confidence: "high" | "medium" | "low";
  status: SuggestionStatus;
}

// ─── Agent suggestions (Run night, Orders) ───────────────────────────────────
// The contract shape is the view model too; see src/lib/api-types.ts.
export type { Suggestion, SuggestionType } from "@/lib/api-types";
