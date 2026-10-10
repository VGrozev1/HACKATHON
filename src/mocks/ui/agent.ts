// A scripted night of the agent for mock mode: what a real run streams, step by step.

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
    detail: "4 below 40%: Sofia Tech Park 28%, Tokuda ER 31%, Gym Lozenets 34%, Pulse Druzhba 37%. 3 items expire within 48 h. Capital Fort is offline.",
  },
  { type: "tool_call", tool: "forecast", title: "Forecasting demand", detail: "20 machines, until the next visit (Mon 12 Oct)" },
  {
    type: "tool_result",
    tool: "forecast",
    title: "Baseline forecast: 1,684 units across the fleet",
    detail: "4-week day-of-week average per slot. Gyms up 22% for the weekend; offices close to zero on Sunday.",
  },
  {
    type: "thinking",
    title: "Checking weather and calendar",
    detail: "Sofia this weekend: 31°C and sunny. No public holiday before 1 Nov.",
  },
  {
    type: "decision",
    title: "Adjusted forecast for Gym Lozenets +30%: hot weekend, 31°C",
    detail: "Water and isotonic drinks sold out there last Saturday at 18:10, when it was 27°C.",
  },
  {
    type: "decision",
    title: "Cut sandwiches at Tokuda Hospital lobby by 40%",
    detail: "6 of the last 12 expired unsold. Only reload what sells in 2 days.",
  },
  { type: "tool_call", tool: "plan_route", title: "Planning the route", detail: "Machines below 40% stock or with items expiring within 48 h" },
  {
    type: "tool_result",
    tool: "plan_route",
    title: "Route planned: 6 stops, 23.4 km, about 2 h 40 min",
    detail: "Pulse Druzhba → Business Park Sofia B4 → Sofia Tech Park → Gym Lozenets → Tokuda ER → Tokuda lobby",
  },
  { type: "tool_call", tool: "create_purchase_order", title: "Ordering drinks", detail: "Aqua Distribution: 4 lines, €183.72" },
  {
    type: "decision",
    title: "Ordered €184 from Aqua Distribution: sent automatically",
    detail: "192 water, 72 Red Bull, 48 sport water and 12 isotonic for the hot weekend at the gyms.",
  },
  { type: "tool_call", tool: "create_purchase_order", title: "Ordering snacks", detail: "Snack Express: 4 lines, €411.60" },
  {
    type: "guardrail",
    title: "Order €412 to Snack Express exceeds €300 limit: waiting for approval",
    detail: "Blocked by the order guardrail in code. Approval request sent to the operator in Telegram.",
  },
  { type: "tool_call", tool: "create_purchase_order", title: "Ordering fresh food", detail: "Fresh Kitchen Sofia: 4 lines, €95.80" },
  {
    type: "decision",
    title: "Ordered €96 from Fresh Kitchen Sofia: sent automatically",
    detail: "More sandwiches for Sofia Tech Park (sold out by 12:40), fewer for Tokuda lobby.",
  },
  { type: "tool_call", tool: "send_to_supplier", title: "Emailing suppliers", detail: "2 approved orders: Aqua Distribution, Fresh Kitchen Sofia" },
  { type: "tool_call", tool: "notify_stocker", title: "Sending load lists", detail: "Telegram: 6 stops for Ivan, the stocker, starting 07:30" },
  {
    type: "done",
    title: "Night planned in 19 steps",
    detail: "3 orders (€691), 6 stops, 1 order waiting for approval.",
  },
];

export const agentSummary =
  "Tonight I planned a 6-stop route covering the 4 machines below 40% stock and the 2 with food about to expire. " +
  "I ordered €691 of stock from three suppliers: two orders went out automatically, and the €412 Snack Express order waits for your approval. " +
  "I also raised Gym Lozenets' water forecast by 30% for the hot weekend.";

export const tonightsRoute: Visit[] = [
  {
    id: "visit-1", order: 1, machineId: "SOF-GYM-06", machineName: "Pulse Druzhba", done: false,
    loadList: [{ product: "Myprotein bar chocolate 60 g", quantity: 12 }, { product: "Red Bull 250 ml", quantity: 8 }, { product: "Devin water 0.5 l", quantity: 10 }],
  },
  {
    id: "visit-2", order: 2, machineId: "SOF-OFF-01", machineName: "Business Park Sofia B4", done: false,
    loadList: [{ product: "Shopska salad bowl", quantity: 4 }, { product: "Nescafé iced latte 250 ml", quantity: 6 }],
  },
  {
    id: "visit-3", order: 3, machineId: "SOF-OFF-03", machineName: "Sofia Tech Park", done: false,
    loadList: [{ product: "Ham & cheese sandwich", quantity: 8 }, { product: "Nescafé iced latte 250 ml", quantity: 12 }, { product: "Snickers 50 g", quantity: 10 }, { product: "Devin water 0.5 l", quantity: 8 }],
  },
  {
    id: "visit-4", order: 4, machineId: "SOF-GYM-01", machineName: "Gym Lozenets", done: false,
    loadList: [{ product: "Devin water 0.5 l", quantity: 14 }, { product: "Red Bull 250 ml", quantity: 12 }, { product: "Powerade isotonic 0.5 l", quantity: 8 }, { product: "Barebells peanut bar 55 g", quantity: 6 }],
  },
  {
    id: "visit-5", order: 5, machineId: "SOF-HOS-01", machineName: "Tokuda Hospital ER", done: false,
    loadList: [{ product: "Devin water 0.5 l", quantity: 12 }, { product: "Chicken wrap", quantity: 6 }, { product: "Coca-Cola 330 ml", quantity: 6 }],
  },
  {
    id: "visit-6", order: 6, machineId: "SOF-HOS-02", machineName: "Tokuda Hospital lobby", done: false,
    loadList: [{ product: "Ham & cheese sandwich", quantity: 4 }, { product: "Fresh fruit cup", quantity: 6 }, { product: "Remove: expiring chicken wraps", quantity: 4 }],
  },
];
