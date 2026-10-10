// Fake API responses (task S3), typed against src/lib/api-types.ts.
// The stub routes in src/app/api serve these until Todor's real endpoints land
// (checkpoint 1, hour 8). Keep them realistic: Kalin designs screens around them.

import type {
  AgentRun,
  Benchmark,
  DailySales,
  InvestorStatement,
  MachineDetail,
  MachineForecast,
  MachineSales,
  MachineSummary,
  PurchaseOrder,
  Visit,
} from "@/lib/api-types";

export const mockMachines: MachineSummary[] = [
  {
    id: "SOF-GYM-01",
    name: "Gym Lozenets",
    locationType: "GYM",
    city: "Sofia",
    lat: 42.6735,
    lng: 23.3261,
    online: true,
    stockPercent: 34,
    salesToday: { units: 41, revenue: 97.6 },
    alerts: [
      { kind: "STOCK_OUT", message: "Slot A1 (Devin water 0.5 l) empty since 18:10" },
    ],
  },
  {
    id: "SOF-OFF-01",
    name: "Business Park Sofia, Building 8",
    locationType: "OFFICE",
    city: "Sofia",
    lat: 42.6253,
    lng: 23.3725,
    online: true,
    stockPercent: 71,
    salesToday: { units: 63, revenue: 128.4 },
    alerts: [],
  },
  {
    id: "SOF-HOS-01",
    name: "Alexandrovska Hospital, Lobby",
    locationType: "HOSPITAL",
    city: "Sofia",
    lat: 42.6889,
    lng: 23.3093,
    online: true,
    stockPercent: 52,
    salesToday: { units: 38, revenue: 74.2 },
    alerts: [
      {
        kind: "EXPIRING",
        message: "6 sandwiches in C2 expire tomorrow",
        likelyCause: "Loaded 12 on Monday; sells about 3 a day",
      },
    ],
  },
  {
    id: "SOF-OFF-02",
    name: "Capital Fort",
    locationType: "OFFICE",
    city: "Sofia",
    lat: 42.6627,
    lng: 23.3828,
    online: false,
    stockPercent: 60,
    salesToday: { units: 0, revenue: 0 },
    alerts: [
      {
        kind: "OFFLINE",
        message: "No signal since 09:42",
        likelyCause: "Card reader lost connection; sales may be cash only",
      },
    ],
  },
];

export function mockMachineDetail(id: string): MachineDetail | undefined {
  const summary = mockMachines.find((m) => m.id === id);
  if (!summary) return undefined;
  return {
    ...summary,
    address: null,
    lastVisit: "2026-10-08T07:30:00Z",
    nextVisit: "2026-10-11T07:30:00Z",
    slots: [
      { slotId: `${id}-A1`, code: "A1", productId: "water-500", productName: "Devin water 0.5 l", capacity: 24, quantity: 0, nextExpiry: null, stockOut: true },
      { slotId: `${id}-A2`, code: "A2", productId: "redbull-250", productName: "Red Bull 250 ml", capacity: 20, quantity: 7, nextExpiry: "2027-03-01T00:00:00Z", stockOut: false },
      { slotId: `${id}-B1`, code: "B1", productId: "protein-bar", productName: "Protein bar 50 g", capacity: 15, quantity: 9, nextExpiry: "2026-12-20T00:00:00Z", stockOut: false },
      { slotId: `${id}-C2`, code: "C2", productId: "sandwich-chicken", productName: "Chicken sandwich", capacity: 12, quantity: 6, nextExpiry: "2026-10-11T00:00:00Z", stockOut: false },
    ],
  };
}

// Deterministic 60-day series with a weekly shape, so charts look real.
function series(days: number, base: number, weekendFactor: number): DailySales[] {
  const out: DailySales[] = [];
  const end = new Date("2026-10-10T00:00:00Z");
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - i);
    const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
    const wobble = ((i * 37) % 11) - 5; // fixed "noise"
    const units = Math.max(0, Math.round(base * (weekend ? weekendFactor : 1) + wobble));
    out.push({ day: d.toISOString().slice(0, 10), units, revenue: Math.round(units * 2.2 * 100) / 100 });
  }
  return out;
}

export function mockMachineSales(id: string, days = 60): MachineSales {
  const office = id.includes("OFF");
  return {
    machineId: id,
    days: series(days, office ? 60 : 40, office ? 0.3 : 1.2),
    topProducts: [
      { productId: "water-500", productName: "Devin water 0.5 l", units: 610 },
      { productId: "redbull-250", productName: "Red Bull 250 ml", units: 402 },
      { productId: "protein-bar", productName: "Protein bar 50 g", units: 288 },
    ],
  };
}

export function mockMachineForecast(id: string): MachineForecast {
  return {
    machineId: id,
    from: "2026-10-10",
    until: "2026-10-11",
    slots: [
      { slotId: `${id}-A1`, productId: "water-500", baseline: 18, adjusted: 24, reason: "Hot weekend forecast (29 °C): water +30%" },
      { slotId: `${id}-A2`, productId: "redbull-250", baseline: 11, adjusted: null, reason: null },
      { slotId: `${id}-B1`, productId: "protein-bar", baseline: 6, adjusted: null, reason: null },
    ],
    history: series(14, 40, 1.2).map((d, i) => ({
      day: d.day,
      forecast: d.units + ((i % 3) - 1) * 3,
      actual: d.units,
    })),
  };
}

export const mockOrders: PurchaseOrder[] = [
  {
    id: "po_demo_1",
    supplierId: "sup-drinks",
    supplierName: "Sofia Beverages Ltd",
    status: "SENT",
    total: 186.4,
    deliveryDate: "2026-10-12",
    explanation: "Water and Red Bull for 4 gyms: hot weekend, two stock-outs last Saturday.",
    lines: [
      { productId: "water-500", productName: "Devin water 0.5 l", quantity: 120, unitCost: 0.42 },
      { productId: "redbull-250", productName: "Red Bull 250 ml", quantity: 96, unitCost: 1.42 },
    ],
    machineIds: ["SOF-GYM-01"],
    agentRunId: "run_demo_1",
    createdAt: "2026-10-10T01:12:00Z",
  },
  {
    id: "po_demo_2",
    supplierId: "sup-fresh",
    supplierName: "FreshBox Catering",
    status: "AWAITING_APPROVAL",
    total: 412.0,
    deliveryDate: "2026-10-11",
    explanation: "Sandwiches and salads for offices and the hospital; over €300, needs approval.",
    lines: [
      { productId: "sandwich-chicken", productName: "Chicken sandwich", quantity: 160, unitCost: 1.65 },
      { productId: "salad-greek", productName: "Greek salad", quantity: 80, unitCost: 1.85 },
    ],
    machineIds: ["SOF-OFF-01", "SOF-HOS-01"],
    agentRunId: "run_demo_1",
    createdAt: "2026-10-10T01:12:30Z",
  },
];

export const mockVisits: Visit[] = [
  {
    id: "visit_demo_1",
    date: "2026-10-11",
    routeOrder: 1,
    machineId: "SOF-GYM-01",
    machineName: "Gym Lozenets",
    status: "SENT",
    loadList: [
      { slotId: "SOF-GYM-01-A1", productId: "water-500", productName: "Devin water 0.5 l", quantity: 24, reason: "Empty; hot weekend" },
      { slotId: "SOF-GYM-01-A2", productId: "redbull-250", productName: "Red Bull 250 ml", quantity: 13, reason: "Below 40%" },
    ],
    doneAt: null,
  },
  {
    id: "visit_demo_2",
    date: "2026-10-11",
    routeOrder: 2,
    machineId: "SOF-HOS-01",
    machineName: "Alexandrovska Hospital, Lobby",
    status: "SENT",
    loadList: [
      { slotId: "SOF-HOS-01-C2", productId: "sandwich-chicken", productName: "Chicken sandwich", quantity: 6, reason: "Replace 6 expiring tomorrow" },
    ],
    doneAt: null,
  },
];

export const mockAgentRun: AgentRun = {
  id: "run_demo_1",
  runDate: "2026-10-10",
  status: "SUCCEEDED",
  startedAt: "2026-10-10T01:10:00Z",
  finishedAt: "2026-10-10T01:12:40Z",
  explanation: "2 orders, 2 stops tomorrow. Gyms get extra water for the hot weekend.",
  steps: [
    { at: "2026-10-10T01:10:01Z", type: "thought", text: "Checking stock across 20 machines." },
    { at: "2026-10-10T01:10:02Z", type: "tool_call", tool: "get_stock", input: { machineIds: "all" } },
    { at: "2026-10-10T01:10:03Z", type: "tool_result", tool: "get_stock", output: { belowThreshold: ["SOF-GYM-01", "SOF-HOS-01"] } },
    { at: "2026-10-10T01:10:05Z", type: "tool_call", tool: "forecast", input: { machineId: "SOF-GYM-01" } },
    { at: "2026-10-10T01:11:20Z", type: "tool_call", tool: "create_purchase_order", input: { supplierId: "sup-drinks", total: 186.4 } },
    { at: "2026-10-10T01:12:00Z", type: "decision", text: "Order sent automatically (under €300)." },
  ],
  decisions: [
    { kind: "order", refId: "po_demo_1", summary: "Ordered 120 water and 96 Red Bull", reason: "Hot weekend; 2 gym stock-outs last Saturday" },
    { kind: "order", refId: "po_demo_2", summary: "Fresh food order, €412, waiting for approval", reason: "Over the €300 auto-approve limit" },
    { kind: "visit", refId: "visit_demo_1", summary: "Gym Lozenets first stop", reason: "Water slot empty" },
  ],
};

export const mockBenchmark: Benchmark = {
  from: "2026-10-03",
  until: "2026-10-10",
  agent: { stockOuts: 6, expiredUnits: 4, lostRevenue: 31.5, wastedCost: 6.6 },
  fixedWeeklyOrder: { stockOuts: 29, expiredUnits: 22, lostRevenue: 164.2, wastedCost: 36.3 },
  daily: series(7, 4, 1).map((d, i) => ({ day: d.day, agentStockOuts: i % 2, fixedStockOuts: 3 + (i % 3) })),
};

export function mockInvestorStatement(id: string, month = "2026-10"): InvestorStatement {
  return {
    investorId: id,
    investorName: "Demo Investor",
    machineId: "SOF-GYM-01",
    month,
    payoutModel: "B",
    revenue: 2840,
    costOfGoods: 1190,
    operatingCosts: 420,
    profit: 1230,
    payout: 568,
    daily: series(30, 40, 1.2),
  };
}
