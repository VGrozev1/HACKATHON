// Tonight's suggestions from the agent (mock mode): things beyond the restock that a
// manager decides on. Names match the fleet; the heatwave and the slow-seller swap
// are the two the demo talks about.

import type { Suggestion } from "@/lib/api-types";

export const mockSuggestions: Suggestion[] = [
  {
    id: "sg-101",
    runDate: "2026-10-10",
    type: "extra_stock",
    machineId: "SOF-GYM-01",
    machineName: "Gym Lozenets",
    product: "Devin water 0.5 l",
    suggestion: "35°C this weekend: load 2× water at Gym Lozenets",
    reason: "Open-Meteo forecasts 35°C on Saturday and Sunday. On the last hot weekend (27°C) water sold out by 18:10 on Saturday.",
    expectedEffect: "≈ 60 more bottles sold and no Saturday-evening stock-out",
    status: "pending",
  },
  {
    id: "sg-102",
    runDate: "2026-10-10",
    type: "product_swap",
    machineId: "SOF-OFF-01",
    machineName: "Business Park Sofia, Building 8",
    product: "Bankya sparkling 0.5 l",
    suggestion: "Swap Bankya sparkling (A2) for a second cold brew coffee slot",
    reason: "Sparkling water sells 1.2 a day here and 14 bottles have sat in the slot for 3 weeks; cold brew sells 9 a day and runs out by Thursday.",
    expectedEffect: "≈ €35 more a week and one fewer slow-moving product",
    status: "pending",
  },
  {
    id: "sg-103",
    runDate: "2026-10-10",
    type: "price_change",
    machineId: "SOF-UNI-01",
    machineName: "Sofia University, Rectorate",
    product: "Red Bull 250 ml",
    suggestion: "Raise Red Bull from €2.90 to €3.20 (+10%)",
    reason: "It has sold out every weekday since lectures started on 1 October, usually by 14:00. Within the ±15% price guardrail.",
    expectedEffect: "≈ €28 more a week at the same volume",
    status: "pending",
  },
  {
    id: "sg-104",
    runDate: "2026-10-10",
    type: "visit_change",
    machineId: "SOF-GYM-05",
    machineName: "Gym Druzhba",
    suggestion: "Move the weekly visit from Monday morning to Friday evening",
    reason: "Protein bars sold out before the Monday visit in 3 of the last 4 weekends, the gym's busiest days.",
    expectedEffect: "≈ 12 fewer missed sales a week, same number of visits",
    status: "pending",
  },
  {
    id: "sg-098",
    runDate: "2026-10-09",
    type: "product_swap",
    machineId: "SOF-HOS-02",
    machineName: "Lozenets Hospital, Outpatients",
    product: "Chicken sandwich",
    suggestion: "Replace chicken sandwiches (D1) with Bulgarian yogurt with fruit",
    reason: "6 of the last 12 chicken sandwiches expired unsold; yogurt keeps for 7 days and sells 3 a day here.",
    expectedEffect: "≈ €10 less waste a week",
    status: "accepted",
  },
];
