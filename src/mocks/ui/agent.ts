// A scripted night of the agent for mock mode: what a real run streams, step by step.
// Names, suppliers and products match Todor's simulated fleet.

import type { AgentStep, Visit } from "@/types";

type StepSeed = Omit<AgentStep, "id" | "timestamp">;

export const agentScript: StepSeed[] = [
  {
    type: "thinking",
    title: "Planning the night of Sat 10 Oct",
    detail: "First I read the fleet's stock and sales, then forecast demand until each machine's next visit.",
  },
  { type: "tool_call", tool: "get_stock", title: "Reading stock", detail: "All 20 machines, every slot and batch expiry" },
  {
    type: "tool_result",
    tool: "get_stock",
    title: "Stock read for 20 machines",
    detail: "4 below 40%: Sofia Tech Park 28%, Alexandrovska Hospital 31%, Gym Lozenets 34%, Gym Druzhba 37%. 3 items expire within 48 h. Capital Fort is offline.",
  },
  { type: "tool_call", tool: "forecast", title: "Forecasting demand", detail: "20 machines, until the next visit (Mon 12 Oct)" },
  {
    type: "tool_result",
    tool: "forecast",
    title: "Baseline forecast: 1,712 units across the fleet",
    detail: "4-week day-of-week average per slot. Gyms up 22% for the weekend; offices close to zero on Sunday.",
  },
  {
    type: "thinking",
    title: "Checking weather and calendar",
    detail: "Sofia this weekend: 31°C and sunny. Lectures started on 1 October. No public holiday before 1 Nov.",
  },
  {
    type: "decision",
    title: "Adjusted forecast for Gym Lozenets +30%: hot weekend, 31°C",
    detail: "Water and isotonic drinks sold out there last Saturday at 18:10, when it was 27°C.",
  },
  {
    type: "decision",
    title: "Raised Sofia University forecast +45%: lectures have started",
    detail: "The 4-week average still includes the summer break, so it underestimates term-time demand.",
  },
  {
    type: "decision",
    title: "Cut sandwiches at Lozenets Hospital by 40%",
    detail: "6 of the last 12 expired unsold. Only reload what sells in 2 days.",
  },
  { type: "tool_call", tool: "plan_route", title: "Planning the route", detail: "Machines below 40% stock or with items expiring within 48 h" },
  {
    type: "tool_result",
    tool: "plan_route",
    title: "Route planned: 6 stops, 24.8 km, about 2 h 45 min",
    detail: "Gym Druzhba → Business Park Sofia → Sofia Tech Park → Gym Lozenets → Lozenets Hospital → Alexandrovska Hospital",
  },
  { type: "tool_call", tool: "create_purchase_order", title: "Ordering drinks", detail: "Sofia Beverages Ltd: 3 lines, €184.40" },
  {
    type: "decision",
    title: "Ordered €184 from Sofia Beverages: sent automatically",
    detail: "240 water, 72 Red Bull and 40 isotonic drinks for the hot weekend at the gyms.",
  },
  { type: "tool_call", tool: "create_purchase_order", title: "Ordering snacks", detail: "Balkan Snack Distribution: 4 lines, €412.00" },
  {
    type: "guardrail",
    title: "Order €412 to Balkan Snack Distribution exceeds €300 limit: waiting for approval",
    detail: "Blocked by the order guardrail in code. Approval request sent to the operator in Telegram.",
  },
  { type: "tool_call", tool: "create_purchase_order", title: "Ordering fresh food", detail: "FreshBox Catering: 4 lines, €95.20" },
  {
    type: "decision",
    title: "Ordered €95 from FreshBox Catering: sent automatically",
    detail: "More sandwiches for Sofia Tech Park (sold out by 12:40), fewer for Lozenets Hospital.",
  },
  { type: "tool_call", tool: "send_to_supplier", title: "Emailing suppliers", detail: "2 approved orders: Sofia Beverages Ltd, FreshBox Catering" },
  { type: "tool_call", tool: "notify_stocker", title: "Sending load lists", detail: "Telegram: 6 stops for Ivan, the stocker, starting 07:30" },
  {
    type: "done",
    title: "Night planned in 20 steps",
    detail: "3 orders (€692), 6 stops, 1 order waiting for approval.",
  },
];

export const agentSummary =
  "Tonight I planned a 6-stop route covering the 4 machines below 40% stock and the 2 with food about to expire. " +
  "I ordered €692 of stock from three suppliers: two orders went out automatically, and the €412 Balkan Snack Distribution order waits for your approval. " +
  "I also raised Gym Lozenets' water forecast by 30% for the hot weekend, and Sofia University's by 45% now that lectures have started.";

export const tonightsRoute: Visit[] = [
  {
    id: "visit-1", order: 1, machineId: "SOF-GYM-05", machineName: "Gym Druzhba", done: false,
    loadList: [{ product: "Protein bar 50 g", quantity: 24 }, { product: "Red Bull 250 ml", quantity: 10 }, { product: "Devin water 0.5 l", quantity: 16 }],
  },
  {
    id: "visit-2", order: 2, machineId: "SOF-OFF-01", machineName: "Business Park Sofia, Building 8", done: false,
    loadList: [{ product: "Greek salad", quantity: 4 }, { product: "Cold brew coffee 250 ml", quantity: 8 }, { product: "Remove: expiring Greek salads", quantity: 4 }],
  },
  {
    id: "visit-3", order: 3, machineId: "SOF-OFF-03", machineName: "Sofia Tech Park", done: false,
    loadList: [{ product: "Ham & cheese sandwich", quantity: 10 }, { product: "Cold brew coffee 250 ml", quantity: 16 }, { product: "Milk chocolate bar 90 g", quantity: 10 }, { product: "Devin water 0.5 l", quantity: 14 }],
  },
  {
    id: "visit-4", order: 4, machineId: "SOF-GYM-01", machineName: "Gym Lozenets", done: false,
    loadList: [{ product: "Devin water 0.5 l", quantity: 48 }, { product: "Red Bull 250 ml", quantity: 20 }, { product: "Isotonic drink 0.5 l", quantity: 14 }, { product: "Protein bar 50 g", quantity: 12 }],
  },
  {
    id: "visit-5", order: 5, machineId: "SOF-HOS-02", machineName: "Lozenets Hospital, Outpatients", done: false,
    loadList: [{ product: "Ham & cheese sandwich", quantity: 4 }, { product: "Bulgarian yogurt with fruit", quantity: 6 }, { product: "Remove: expiring chicken sandwiches", quantity: 4 }],
  },
  {
    id: "visit-6", order: 6, machineId: "SOF-HOS-01", machineName: "Alexandrovska Hospital, Lobby", done: false,
    loadList: [{ product: "Devin water 0.5 l", quantity: 24 }, { product: "Chicken sandwich", quantity: 8 }, { product: "Coca-Cola 330 ml", quantity: 8 }],
  },
];
