import Anthropic from "@anthropic-ai/sdk";
import {
  machines,
  stock,
  avgDailySales,
  warehouse,
  suppliers,
  products,
  openingHours,
  hoursSinceLastSale,
  todaySales,
  cashReports,
  type Coordinates,
} from "./mock-data.ts";
import {
  checkOrder,
  checkSuggestion,
  type OrderStatus,
  type OrderCatalog,
  type SuggestionType,
} from "./guardrails.ts";
import { sendSupplierEmail } from "./email.ts";
import { sendTelegram } from "./telegram.ts";
import { apiGet } from "./api.ts";
// Type-only — erased at runtime, so this never creates an actual
// dependency on Todor's code. It just keeps our shapes honest to the
// contract in api.md as he fills in the real endpoints.
import type { MachineSummary, MachineDetail, MachineForecast, SlotStock, Alert } from "../src/lib/api-types.ts";

// ---- Tool descriptions (what we show Claude) -----------------------------

export const tools: Anthropic.Tool[] = [
  {
    name: "list_machines",
    description:
      "List every vending machine we operate: ID, name, location type, city, coordinates, " +
      "online status, current stock percentage, today's sales, and any active alerts.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_stock",
    description:
      "Get current stock levels for every slot in a vending machine: how many units are left and the slot's total capacity.",
    input_schema: {
      type: "object",
      properties: {
        machine_id: {
          type: "string",
          description: "The vending machine's ID, e.g. GYM-01",
        },
      },
      required: ["machine_id"],
    },
  },
  {
    name: "forecast",
    description:
      "Forecast expected demand for a machine over the next 1-7 days, based on its average daily sales per product.",
    input_schema: {
      type: "object",
      properties: {
        machine_id: {
          type: "string",
          description: "The vending machine's ID, e.g. GYM-01",
        },
        days: {
          type: "integer",
          description: "Number of days to forecast, between 1 and 7.",
          minimum: 1,
          maximum: 7,
        },
      },
      required: ["machine_id", "days"],
    },
  },
  {
    name: "plan_route",
    description:
      "Order a set of machines into an efficient delivery route starting from the warehouse, nearest stop first.",
    input_schema: {
      type: "object",
      properties: {
        machine_ids: {
          type: "array",
          description: "The machine IDs to visit, in any order.",
          items: { type: "string" },
        },
      },
      required: ["machine_ids"],
    },
  },
  {
    name: "create_purchase_order",
    description:
      "Create a purchase order with a supplier for a list of products and quantities, with a reason for the order. " +
      "The order is automatically checked against supplier/product/quantity/expiry/capacity/minimum-order rules — " +
      "the result's status is \"approved\", \"awaiting_approval\" (needs a human), or \"rejected\" (with reasons you should fix and retry). " +
      "Approved orders are emailed to the supplier automatically; awaiting_approval orders are not emailed yet — " +
      "instead a Telegram message with an Approve button is sent to the approver.",
    input_schema: {
      type: "object",
      properties: {
        supplier: {
          type: "string",
          description: "Supplier name, e.g. Metro, FitFoods, or FreshCo.",
        },
        lines: {
          type: "array",
          description: "The products and quantities to order.",
          items: {
            type: "object",
            properties: {
              product: { type: "string", description: "Product name." },
              quantity: { type: "integer", description: "Units to order." },
            },
            required: ["product", "quantity"],
          },
        },
        reason: {
          type: "string",
          description: "Why this order is being placed.",
        },
      },
      required: ["supplier", "lines", "reason"],
    },
  },
  {
    name: "notify_stocker",
    description:
      "Notify the stocker with the planned delivery route and what to load onto the van for each stop " +
      "(sent as Telegram messages — one for the route, one per stop with a Done button).",
    input_schema: {
      type: "object",
      properties: {
        route: {
          type: "array",
          description: "Machine IDs in visiting order.",
          items: { type: "string" },
        },
        load_lists: {
          type: "array",
          description: "What to bring for each stop on the route.",
          items: {
            type: "object",
            properties: {
              machine_id: { type: "string" },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    product: { type: "string" },
                    quantity: { type: "integer" },
                  },
                  required: ["product", "quantity"],
                },
              },
            },
            required: ["machine_id", "items"],
          },
        },
      },
      required: ["route", "load_lists"],
    },
  },
  {
    name: "get_weather",
    description:
      "Get the 3-day weather forecast for Sofia: max temperature in °C and rainfall in mm for each day.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_holidays",
    description: "List Bulgarian public holidays falling in the next 7 days.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "check_alerts",
    description:
      "Check every machine for operational problems: offline (no sale in 6+ hours during opening time), " +
      "sudden zero sales on a normally-popular product (possible jammed slot), cash collected differing " +
      "from the fiscal report by over €2, an empty slot (stock-out), or food about to expire. Detection is " +
      "deterministic; some alerts already include a likely cause, otherwise explain one yourself.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "create_suggestion",
    description:
      "Record a suggestion for the manager to review — never applied automatically, only stored as \"pending\" " +
      "and sent to the approver on Telegram with Accept/Reject buttons. At most 5 per night (extras are rejected " +
      "with a reason); price_change suggestions are capped at ±15% and must name a product we carry.",
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["extra_stock", "product_swap", "price_change", "visit_change"],
          description: "What kind of suggestion this is.",
        },
        machine_id: {
          type: "string",
          description: "The vending machine this suggestion is about.",
        },
        product: {
          type: "string",
          description: "The product this suggestion is about, if any.",
        },
        suggestion: {
          type: "string",
          description: "One sentence describing what to do.",
        },
        reason: {
          type: "string",
          description:
            "One sentence citing the data behind this — weather, a holiday, or a sales trend.",
        },
        expected_effect: {
          type: "string",
          description: "One sentence on the expected outcome.",
        },
        percent_change: {
          type: "number",
          description:
            "Required for price_change suggestions only: the proposed percent change in price " +
            "(e.g. -10 for a 10% discount, 12 for a 12% increase). Must be between -15 and 15.",
        },
      },
      required: ["type", "machine_id", "suggestion", "reason", "expected_effect"],
    },
  },
];

// ---- Purchase orders (in-memory for now; Step 6 adds real checks) --------

type PurchaseOrderLine = { product: string; quantity: number };

export type PurchaseOrder = {
  id: string;
  supplier: string;
  lines: PurchaseOrderLine[];
  reason: string;
  createdAt: string;
  status: OrderStatus;
  totalEur: number;
  reasons: string[];
  emailed: boolean;
};

export const purchaseOrders: PurchaseOrder[] = [];
let nextOrderId = 1;

// ---- Suggestions (never auto-applied — stored for a human to decide) -----

export type Suggestion = {
  id: string;
  runDate: string;
  type: SuggestionType;
  machineId: string;
  machineName: string;
  product?: string;
  suggestion: string;
  reason: string;
  expectedEffect: string;
  percentChange?: number;
  status: "pending" | "accepted" | "rejected";
  reasons: string[];
};

export const suggestions: Suggestion[] = [];
let nextSuggestionId = 1;
// Counts only successfully-created ("pending") suggestions — a rejected
// attempt (bad machine, price change too big, etc.) never used up a slot.
let pendingSuggestionsTonight = 0;

// ---- Tool implementations -------------------------------------------------

// USE_MOCK=1 shapes mock-data.ts to look exactly like the real API would,
// so every tool behaves the same to Claude regardless of which is active.
function mockListMachines(): MachineSummary[] {
  return machines.map((m) => {
    const slots = stock[m.id] ?? [];
    const stockPercent = slots.length
      ? Math.round((slots.reduce((sum, s) => sum + s.count / s.capacity, 0) / slots.length) * 100)
      : 0;
    return {
      id: m.id,
      name: m.name,
      locationType: m.type.toUpperCase() as MachineSummary["locationType"],
      city: "Sofia",
      lat: m.location.lat,
      lng: m.location.lng,
      online: true,
      stockPercent,
      salesToday: { units: 0, revenue: 0 }, // not tracked in mock data
      alerts: [],
    };
  });
}

async function listMachines(): Promise<MachineSummary[]> {
  if (process.env.USE_MOCK === "1") {
    return mockListMachines();
  }
  return apiGet<MachineSummary[]>("/api/machines");
}

// Slugifies a product name into something that looks like Todor's
// productId convention (e.g. "water-500" in api.md's own example).
function productIdFor(productName: string): string {
  return productName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function mockGetStock(machineId: string): SlotStock[] | null {
  const machineStock = stock[machineId];
  if (!machineStock) return null;
  return machineStock.map((entry, i) => ({
    slotId: `${machineId}-A${i + 1}`,
    code: `A${i + 1}`,
    productId: productIdFor(entry.product),
    productName: entry.product,
    capacity: entry.capacity,
    quantity: entry.count,
    nextExpiry: null,
    stockOut: entry.count === 0,
  }));
}

async function getStock(machineId: string): Promise<SlotStock[] | { error: string }> {
  if (process.env.USE_MOCK === "1") {
    const slots = mockGetStock(machineId);
    if (!slots) {
      return { error: `Unknown machine ID "${machineId}"` };
    }
    return slots;
  }
  const detail = await apiGet<MachineDetail>(`/api/machines/${encodeURIComponent(machineId)}`);
  return detail.slots;
}

function mockForecast(machineId: string, days: number) {
  const machineStock = stock[machineId];
  if (!machineStock) {
    return { error: `Unknown machine ID "${machineId}"` };
  }

  const salesForMachine = avgDailySales[machineId] ?? {};
  const forecastLines = machineStock.map((entry) => {
    const daily = salesForMachine[entry.product] ?? 0;
    return {
      product: entry.product,
      avgDailySales: daily,
      expectedUnits: Math.round(daily * days),
    };
  });

  return { machine_id: machineId, days, forecast: forecastLines };
}

// Days between two "YYYY-MM-DD" strings (at least 1, so a same-day window
// never divides by zero).
function dayCount(from: string, until: string): number {
  return Math.max(1, Math.round((Date.parse(until) - Date.parse(from)) / 86400000));
}

async function forecast(machineId: string, days: number) {
  if (!Number.isInteger(days) || days < 1 || days > 7) {
    return { error: `"days" must be an integer between 1 and 7, got ${days}` };
  }
  if (process.env.USE_MOCK === "1") {
    return mockForecast(machineId, days);
  }

  // Todor's real forecast (A5/B4) is a baseline over "until the next visit",
  // not a fixed N-day window — convert it to a per-day rate, then project
  // that rate over the days Claude actually asked for. It only has slot ids
  // and product ids, so join against the machine detail for product names.
  const [detail, fc] = await Promise.all([
    apiGet<MachineDetail>(`/api/machines/${encodeURIComponent(machineId)}`),
    apiGet<MachineForecast>(`/api/machines/${encodeURIComponent(machineId)}/forecast`),
  ]);
  const productNameBySlot = new Map(detail.slots.map((s) => [s.slotId, s.productName]));
  const windowDays = dayCount(fc.from, fc.until);
  const forecastLines = fc.slots.map((s) => {
    const daily = s.baseline / windowDays;
    return {
      product: productNameBySlot.get(s.slotId) ?? s.productId,
      avgDailySales: Math.round(daily * 100) / 100,
      expectedUnits: Math.round(daily * days),
    };
  });

  return { machine_id: machineId, days, forecast: forecastLines };
}

// Straight-line distance between two coordinates. Good enough for a city
// the size of Sofia — not meant to replace real mapping/routing software.
function distance(a: Coordinates, b: Coordinates): number {
  const dLat = a.lat - b.lat;
  const dLng = a.lng - b.lng;
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

async function planRoute(machineIds: string[]) {
  // list_machines already resolves to the real fleet when it's available —
  // reusing it here means plan_route gets real coordinates for free, with
  // no separate mock/real branch of its own.
  const fleet = await listMachines();
  const byId = new Map(fleet.map((m) => [m.id, { lat: m.lat, lng: m.lng }]));

  const stops: { id: string; location: Coordinates }[] = [];
  for (const id of machineIds) {
    const location = byId.get(id);
    if (!location) {
      return { error: `Unknown machine ID "${id}"` };
    }
    stops.push({ id, location });
  }

  // Nearest-neighbour: start at the warehouse (no real endpoint for this —
  // it's one fixed address, not fleet data), repeatedly jump to whichever
  // remaining stop is closest to wherever we currently are.
  const remaining = [...stops];
  const route: string[] = [];
  let current: Coordinates = warehouse.location;

  while (remaining.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = distance(current, remaining[0].location);
    for (let i = 1; i < remaining.length; i++) {
      const d = distance(current, remaining[i].location);
      if (d < nearestDistance) {
        nearestDistance = d;
        nearestIndex = i;
      }
    }
    const [next] = remaining.splice(nearestIndex, 1);
    route.push(next.id);
    current = next.location;
  }

  return { route };
}

const SOFIA_LOCATION = { lat: 42.6977, lng: 23.3219 };

// Formats a Date as a local-calendar "YYYY-MM-DD" string. We deliberately
// don't use toISOString() for this: it always converts to UTC, which shifts
// the date backward by a day for any timezone ahead of UTC (e.g. Sofia).
function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function getWeather() {
  // DEMO_HEATWAVE=1 skips the real API call so a demo can reliably show the
  // "hot day -> more cold drinks" behavior without waiting for real weather.
  if (process.env.DEMO_HEATWAVE === "1") {
    const today = new Date();
    return [0, 1, 2].map((offset) => {
      const date = new Date(today);
      date.setDate(date.getDate() + offset);
      return { date: formatLocalDate(date), maxTempC: 35, rainMm: 0 };
    });
  }

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${SOFIA_LOCATION.lat}&longitude=${SOFIA_LOCATION.lng}` +
      `&daily=temperature_2m_max,precipitation_sum&timezone=Europe%2FSofia&forecast_days=3`;
    const response = await fetch(url);
    if (!response.ok) {
      return { error: `Open-Meteo request failed with status ${response.status}` };
    }
    const data = await response.json();

    return data.daily.time.map((date: string, i: number) => ({
      date,
      maxTempC: data.daily.temperature_2m_max[i],
      rainMm: data.daily.precipitation_sum[i],
    }));
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

// Fixed-date Bulgarian public holidays (month is 1-indexed). Orthodox Easter
// and the holidays tied to it (Good Friday, Easter Sunday/Monday) move every
// year and are NOT included here — add their dates by hand each year.
const FIXED_HOLIDAYS: { month: number; day: number; name: string }[] = [
  { month: 1, day: 1, name: "New Year's Day" },
  { month: 3, day: 3, name: "Liberation Day" },
  { month: 5, day: 1, name: "Labour Day" },
  { month: 5, day: 6, name: "St. George's Day / Army Day" },
  { month: 5, day: 24, name: "Culture and Literacy Day" },
  { month: 9, day: 6, name: "Unification Day" },
  { month: 9, day: 22, name: "Independence Day" },
  { month: 12, day: 24, name: "Christmas Eve" },
  { month: 12, day: 25, name: "Christmas Day" },
  { month: 12, day: 26, name: "Second Day of Christmas" },
];

function getHolidays() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + 7);

  // Build candidate dates for this year and next, in case the 7-day window
  // crosses a New Year's boundary (e.g. Dec 27 -> Jan 2).
  const candidates: { date: Date; name: string }[] = [];
  for (const year of [today.getFullYear(), today.getFullYear() + 1]) {
    for (const holiday of FIXED_HOLIDAYS) {
      candidates.push({ date: new Date(year, holiday.month - 1, holiday.day), name: holiday.name });
    }
  }

  return candidates
    .filter((c) => c.date >= today && c.date <= horizon)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((c) => ({ date: formatLocalDate(c.date), name: c.name }));
}

const OFFLINE_HOURS_THRESHOLD = 6;
const ZERO_SALES_DAILY_THRESHOLD = 10;
const CASH_MISMATCH_THRESHOLD_EUR = 2;

// Real alerts (from /api/machines) cover two more kinds than the mock
// data models: STOCK_OUT (a slot is empty right now) and EXPIRING (food
// about to go off). Both are self-explanatory from their message, so
// there's no extra "likely cause" reasoning needed for them.
export type AlertKind = "OFFLINE" | "ZERO_SALES" | "CASH_MISMATCH" | "STOCK_OUT" | "EXPIRING";

export type AlertFact = {
  machineId: string;
  kind: AlertKind;
  message: string;
};

// Pure detection against mock-data.ts — every number here is a fact from
// (mock) data, not a guess. Used only under USE_MOCK=1: the real API has no
// granular-enough endpoint for opening hours, hour-of-last-sale, per-product
// daily actuals, or cash reconciliation, so these mock tables stand in.
function mockCheckAlerts(): AlertFact[] {
  const alerts: AlertFact[] = [];
  const currentHour = new Date().getHours();

  for (const machine of machines) {
    const hours = openingHours[machine.id];
    const isOpenNow = hours ? currentHour >= hours.open && currentHour < hours.close : true;
    const hoursAgo = hoursSinceLastSale[machine.id] ?? 0;

    if (isOpenNow && hoursAgo >= OFFLINE_HOURS_THRESHOLD) {
      alerts.push({
        machineId: machine.id,
        kind: "OFFLINE",
        message: `${machine.name} (${machine.id}) hasn't recorded a sale in ${hoursAgo} hours, during its usual opening hours.`,
      });
    }

    const todaysSalesForMachine = todaySales[machine.id] ?? {};
    const averagesForMachine = avgDailySales[machine.id] ?? {};
    for (const [product, avgSales] of Object.entries(averagesForMachine)) {
      const soldToday = todaysSalesForMachine[product] ?? 0;
      if (avgSales >= ZERO_SALES_DAILY_THRESHOLD && soldToday === 0) {
        alerts.push({
          machineId: machine.id,
          kind: "ZERO_SALES",
          message: `${machine.name} (${machine.id}): "${product}" normally sells ~${avgSales}/day but sold 0 today.`,
        });
      }
    }

    const cash = cashReports[machine.id];
    if (cash) {
      const diff = Math.abs(cash.cashCollected - cash.fiscalReportTotal);
      if (diff > CASH_MISMATCH_THRESHOLD_EUR) {
        alerts.push({
          machineId: machine.id,
          kind: "CASH_MISMATCH",
          message:
            `${machine.name} (${machine.id}): cash collected (€${cash.cashCollected.toFixed(2)}) ` +
            `differs from the fiscal report (€${cash.fiscalReportTotal.toFixed(2)}) by €${diff.toFixed(2)}.`,
        });
      }
    }
  }

  return alerts;
}

function withCause(alert: Alert): string {
  return alert.likelyCause ? `${alert.message} (${alert.likelyCause})` : alert.message;
}

async function checkAlerts(): Promise<AlertFact[]> {
  if (process.env.USE_MOCK === "1") {
    return mockCheckAlerts();
  }
  // The real /api/machines (A6) already computes every alert kind
  // server-side from real stock, sales and cash data — no need to rebuild
  // any of that here.
  const fleet = await listMachines();
  return fleet.flatMap((m) => m.alerts.map((a) => ({ machineId: m.id, kind: a.kind, message: withCause(a) })));
}

async function createPurchaseOrder(
  supplier: string,
  lines: PurchaseOrderLine[],
  reason: string,
): Promise<PurchaseOrder> {
  // No real endpoint yet for the product/supplier catalog or warehouse
  // capacity — mock-data.ts is the only source either mode has for these.
  const catalog: OrderCatalog = { suppliers, products, warehouse, avgDailySales };
  const { status, totalEur, reasons } = checkOrder(supplier, lines, catalog);

  const order: PurchaseOrder = {
    id: `PO-${String(nextOrderId++).padStart(4, "0")}`,
    supplier,
    lines,
    reason,
    createdAt: new Date().toISOString(),
    status,
    totalEur,
    reasons,
    emailed: false,
  };
  // Record the order before attempting to email it, so a failed send still
  // leaves a trace instead of silently losing the order.
  purchaseOrders.push(order);

  // Only approved orders go out — awaiting_approval needs a human to tap
  // Approve first, and rejected orders were never going to be bought.
  if (status === "approved") {
    await sendSupplierEmail(order);
    order.emailed = true;
  } else if (status === "awaiting_approval") {
    await sendTelegram(
      `Purchase order ${order.id} awaiting approval\n` +
        `Supplier: ${order.supplier}\n` +
        `Total: €${order.totalEur.toFixed(2)}\n` +
        `Reason: ${order.reason}`,
      [{ text: "Approve", callback_data: `approve:${order.id}` }],
      process.env.TELEGRAM_APPROVER_CHAT_ID!,
    );
  }

  return order;
}

async function createSuggestion(
  type: SuggestionType,
  machineId: string,
  product: string | undefined,
  suggestionText: string,
  reason: string,
  expectedEffect: string,
  percentChange: number | undefined,
): Promise<Suggestion> {
  // One fetch of the real fleet (or mock, via list_machines' own branching)
  // covers both the "does this machine exist" guardrail and its display name.
  const fleet = await listMachines();
  const machine = fleet.find((m) => m.id === machineId);
  // Products have no real catalog yet — still mock-data.ts either way.
  const check = checkSuggestion(
    { type, machineId, product, percentChange },
    pendingSuggestionsTonight,
    { machines: fleet, products },
  );

  const record: Suggestion = {
    id: `SUG-${String(nextSuggestionId++).padStart(4, "0")}`,
    runDate: formatLocalDate(new Date()),
    type,
    machineId,
    machineName: machine?.name ?? machineId,
    product,
    suggestion: suggestionText,
    reason,
    expectedEffect,
    percentChange,
    status: check.status,
    reasons: check.reasons,
  };
  // Record it either way — a rejected attempt is still worth keeping for
  // the audit trail, same reasoning as rejected purchase orders.
  suggestions.push(record);

  if (check.status === "pending") {
    pendingSuggestionsTonight++;
    await sendTelegram(
      `Suggestion ${record.id} (${record.type}) — ${record.machineId}` +
        (record.product ? ` — ${record.product}` : "") +
        `\n${record.suggestion}\n` +
        `Reason: ${record.reason}\n` +
        `Expected effect: ${record.expectedEffect}`,
      [
        { text: "Accept", callback_data: `sug_ok:${record.id}` },
        { text: "Reject", callback_data: `sug_no:${record.id}` },
      ],
      process.env.TELEGRAM_APPROVER_CHAT_ID!,
    );
  }

  return record;
}

async function notifyStocker(
  route: string[],
  loadLists: { machine_id: string; items: { product: string; quantity: number }[] }[],
) {
  console.log("--- Stocker notification ---");
  console.log(`Route: ${route.join(" -> ")}`);
  for (const stop of loadLists) {
    console.log(`${stop.machine_id}:`);
    for (const item of stop.items) {
      console.log(`  - ${item.product}: ${item.quantity}`);
    }
  }
  console.log("-----------------------------");

  await sendTelegram(`Tonight's route:\n${route.join(" → ")}`);

  for (const stop of loadLists) {
    const itemLines = stop.items
      .map((item) => `- ${item.product}: ${item.quantity}`)
      .join("\n");
    await sendTelegram(`${stop.machine_id} load list:\n${itemLines}`, [
      { text: "Done", callback_data: `done:${stop.machine_id}` },
    ]);
  }

  return { notified: true, route };
}

// ---- Dispatcher -------------------------------------------------------

export async function runTool(name: string, input: any): Promise<unknown> {
  switch (name) {
    case "list_machines":
      return listMachines();
    case "get_stock":
      return getStock(input.machine_id);
    case "forecast":
      return forecast(input.machine_id, input.days);
    case "plan_route":
      return planRoute(input.machine_ids);
    case "create_purchase_order":
      return createPurchaseOrder(input.supplier, input.lines, input.reason);
    case "notify_stocker":
      return notifyStocker(input.route, input.load_lists);
    case "get_weather":
      return getWeather();
    case "get_holidays":
      return getHolidays();
    case "check_alerts":
      return checkAlerts();
    case "create_suggestion":
      return createSuggestion(
        input.type,
        input.machine_id,
        input.product,
        input.suggestion,
        input.reason,
        input.expected_effect,
        input.percent_change,
      );
    default:
      return { error: `Unknown tool "${name}"` };
  }
}
