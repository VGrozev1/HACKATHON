import Anthropic from "@anthropic-ai/sdk";
import {
  machines,
  stock,
  avgDailySales,
  warehouse,
  type Coordinates,
  type StockEntry,
} from "./mock-data.ts";
import { checkOrder, type OrderStatus } from "./guardrails.ts";

// ---- Tool descriptions (what we show Claude) -----------------------------

export const tools: Anthropic.Tool[] = [
  {
    name: "list_machines",
    description:
      "List every vending machine we operate, with its ID, location type, and coordinates.",
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
      "the result's status is \"approved\", \"awaiting_approval\" (needs a human), or \"rejected\" (with reasons you should fix and retry).",
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
      "Notify the stocker with the planned delivery route and what to load onto the van for each stop.",
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
};

export const purchaseOrders: PurchaseOrder[] = [];
let nextOrderId = 1;

// ---- Tool implementations -------------------------------------------------

function listMachines() {
  return machines;
}

function getStock(machineId: string): StockEntry[] | { error: string } {
  const machineStock = stock[machineId];
  if (!machineStock) {
    return { error: `Unknown machine ID "${machineId}"` };
  }
  return machineStock;
}

function forecast(machineId: string, days: number) {
  const machineStock = stock[machineId];
  if (!machineStock) {
    return { error: `Unknown machine ID "${machineId}"` };
  }
  if (!Number.isInteger(days) || days < 1 || days > 7) {
    return { error: `"days" must be an integer between 1 and 7, got ${days}` };
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

// Straight-line distance between two coordinates. Good enough for a city
// the size of Sofia — not meant to replace real mapping/routing software.
function distance(a: Coordinates, b: Coordinates): number {
  const dLat = a.lat - b.lat;
  const dLng = a.lng - b.lng;
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

function planRoute(machineIds: string[]) {
  const stops = [];
  for (const id of machineIds) {
    const machine = machines.find((m) => m.id === id);
    if (!machine) {
      return { error: `Unknown machine ID "${id}"` };
    }
    stops.push(machine);
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

function createPurchaseOrder(
  supplier: string,
  lines: PurchaseOrderLine[],
  reason: string,
): PurchaseOrder {
  const { status, totalEur, reasons } = checkOrder(supplier, lines);

  const order: PurchaseOrder = {
    id: `PO-${String(nextOrderId++).padStart(4, "0")}`,
    supplier,
    lines,
    reason,
    createdAt: new Date().toISOString(),
    status,
    totalEur,
    reasons,
  };
  purchaseOrders.push(order);
  return order;
}

function notifyStocker(
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
    default:
      return { error: `Unknown tool "${name}"` };
  }
}
