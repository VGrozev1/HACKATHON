import Anthropic from "@anthropic-ai/sdk";
import { sendTelegram } from "./telegram.ts";
import { apiGet, apiPost } from "./api.ts";
// Type-only — erased at runtime, so this never creates an actual
// dependency on Todor's code. It just keeps our shapes honest to the
// contract in api.md as he fills in the real endpoints.
import type { MachineSummary } from "../src/lib/api-types.ts";
// Real (not type-only) import: these are pure functions with no imports of
// their own (no Prisma, no DB) — used only for the DEMO_HEATWAVE override's
// date labels, since everything else now goes through /api/weather instead.
import { addDays } from "../src/lib/sim/calendar.ts";

type Coordinates = { lat: number; lng: number };

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
      "Get current stock for a vending machine, one line per product: units left, total slot " +
      "capacity across the slots holding it, which slot codes, and the next expiry date if any.",
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
      "Checked against the real catalog (approved supplier, product-supplier match, quantity 1-1000, sell-through " +
      "before expiry, warehouse capacity, supplier minimum) — the result's status is \"approved\", " +
      "\"awaiting_approval\" (needs a human), or \"rejected\" (with reasons you should fix and retry). " +
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
      "with a reason); price_change suggestions are capped at ±15% and must name a product the machine sells.",
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

// ---- Purchase orders (recorded locally for this run's summary; the real
// validation, persistence, and supplier email all happen server-side now,
// POST /api/orders) -------------------------------------------------------

export type PurchaseOrder = {
  id: string;
  supplier: string;
  lines: { product: string; quantity: number }[];
  reason: string;
  createdAt: string;
  status: "approved" | "awaiting_approval" | "rejected";
  totalEur: number;
  reasons: string[];
  emailed: boolean;
  delivery_date?: string;
};

export const purchaseOrders: PurchaseOrder[] = [];

// ---- Suggestions (never auto-applied — the server stores accepted ones;
// rejected attempts are kept here only, for this run's audit trail) -------

export type SuggestionType = "extra_stock" | "product_swap" | "price_change" | "visit_change";

export type Suggestion = {
  id?: string;
  runDate?: string;
  type: SuggestionType;
  machineId: string;
  machineName?: string;
  product?: string;
  suggestion: string;
  reason: string;
  expectedEffect: string;
  percentChange?: number | null;
  status: "pending" | "accepted" | "rejected";
  reasons?: string[];
  createdAt?: string;
  decidedAt?: string | null;
};

export const suggestions: Suggestion[] = [];

// ---- Tool implementations -------------------------------------------------

async function listMachines(): Promise<MachineSummary[]> {
  return apiGet<MachineSummary[]>("/api/machines");
}

async function getStock(machineId: string) {
  return apiGet(`/api/machines/${encodeURIComponent(machineId)}/stock`);
}

async function forecast(machineId: string, days: number) {
  if (!Number.isInteger(days) || days < 1 || days > 7) {
    return { error: `"days" must be an integer between 1 and 7, got ${days}` };
  }
  return apiGet(`/api/machines/${encodeURIComponent(machineId)}/forecast?days=${days}`);
}

// Straight-line distance between two coordinates. Good enough for a city
// the size of Sofia — not meant to replace real mapping/routing software.
function distance(a: Coordinates, b: Coordinates): number {
  const dLat = a.lat - b.lat;
  const dLng = a.lng - b.lng;
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

async function planRoute(machineIds: string[]) {
  const [fleet, warehouse] = await Promise.all([
    listMachines(),
    apiGet<{ location: Coordinates }>("/api/warehouse"),
  ]);
  const byId = new Map(fleet.map((m) => [m.id, { lat: m.lat, lng: m.lng }]));

  const stops: { id: string; location: Coordinates }[] = [];
  for (const id of machineIds) {
    const location = byId.get(id);
    if (!location) {
      return { error: `Unknown machine ID "${id}"` };
    }
    stops.push({ id, location });
  }

  // Nearest-neighbour: start at the warehouse, repeatedly jump to whichever
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

// Formats a Date as a local-calendar "YYYY-MM-DD" string. We deliberately
// don't use toISOString() for this: it always converts to UTC, which shifts
// the date backward by a day for any timezone ahead of UTC (e.g. Sofia).
function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// The simulated day (SimState.today) driving the app's actual demand
// numbers — not the real calendar date, which can drift from it once
// fast-forward has moved the sim clock on. Falls back to the real local
// date if /api/today is unreachable, so a caller always gets a usable
// date — logged so the fallback isn't silently wrong forever.
let cachedSimToday: string | undefined;
export async function getSimToday(): Promise<string> {
  if (cachedSimToday) return cachedSimToday;
  try {
    cachedSimToday = (await apiGet<{ today: string }>("/api/today")).today;
  } catch (err) {
    console.error("Could not read the simulated day from /api/today, falling back to the real date:", err);
    cachedSimToday = formatLocalDate(new Date());
  }
  return cachedSimToday;
}

async function getWeather() {
  // DEMO_HEATWAVE=1 skips the real weather source so a demo can reliably
  // show the "hot day -> more cold drinks" behavior on demand.
  if (process.env.DEMO_HEATWAVE === "1") {
    const today = await getSimToday();
    return [1, 2, 3].map((offset) => ({ date: addDays(today, offset), maxTempC: 35, rainMm: 0 }));
  }
  return apiGet("/api/weather?days=3");
}

async function getHolidays() {
  return apiGet("/api/holidays?days=7");
}

async function checkAlerts() {
  return apiGet("/api/alerts");
}

async function createPurchaseOrder(
  supplier: string,
  lines: { product: string; quantity: number }[],
  reason: string,
): Promise<PurchaseOrder> {
  // Every rule (approved supplier, product-supplier match, quantity bounds,
  // sell-through before expiry, warehouse capacity, supplier minimum) is
  // checked server-side against the real catalog — that's the final word,
  // not a local guess, so there's nothing to re-check here.
  const order = await apiPost<PurchaseOrder>("/api/orders", { supplier, lines, reason });
  purchaseOrders.push(order);

  // The server emails approved orders itself. Only the "needs a human"
  // case is still this agent's job: a Telegram button for the approver.
  if (order.status === "awaiting_approval") {
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
  const base = process.env.APP_URL;
  const res = await fetch(`${base}/api/suggestions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type,
      machine_id: machineId,
      product,
      suggestion: suggestionText,
      reason,
      expected_effect: expectedEffect,
      percent_change: percentChange,
    }),
  });
  const body = await res.json();

  // 422 means a guardrail rejected it (machine/product unknown, price cap,
  // 5-a-night limit) — a normal, expected outcome the agent should read and
  // react to, not a network failure. Anything else unexpected still throws,
  // same as every other tool (caught by agent.ts's own try/catch).
  if (res.status === 422 && body.status === "rejected") {
    const record: Suggestion = {
      type,
      machineId,
      product,
      suggestion: suggestionText,
      reason,
      expectedEffect,
      percentChange,
      status: "rejected",
      reasons: body.reasons,
    };
    suggestions.push(record);
    return record;
  }
  if (!res.ok) {
    throw new Error(`Todor's API error calling /api/suggestions: ${res.status} ${body.error ?? res.statusText}`);
  }

  const record: Suggestion = body;
  suggestions.push(record);

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

  return record;
}

async function notifyStocker(
  route: string[],
  loadLists: { machine_id: string; items: { product: string; quantity: number }[] }[],
) {
  // Persist tomorrow's route server-side (validates product->slot mapping
  // and capacity) before telling the stocker about it.
  await apiPost("/api/visits", { route, load_lists: loadLists });

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
