import { checkOrder, type OrderCatalog } from "./guardrails.ts";
import { suppliers, products, warehouse, avgDailySales } from "./mock-data.ts";

const catalog: OrderCatalog = { suppliers, products, warehouse, avgDailySales };

type OrderLine = { product: string; quantity: number };

type TestCase = {
  description: string;
  supplier: string;
  lines: OrderLine[];
  expectedStatus: "approved" | "awaiting_approval" | "rejected";
};

const cases: TestCase[] = [
  {
    description: "Normal restock, well within budget and shelf life",
    supplier: "FreshCo",
    lines: [{ product: "Water 0.5l", quantity: 200 }],
    expectedStatus: "approved",
  },
  {
    description: "Unknown supplier",
    supplier: "Acme Snacks",
    lines: [{ product: "Water 0.5l", quantity: 50 }],
    expectedStatus: "rejected",
  },
  {
    description: "100 sandwiches — would expire before the fleet sells through them",
    supplier: "FreshCo",
    lines: [{ product: "Sandwich", quantity: 100 }],
    expectedStatus: "rejected",
  },
  {
    description: "Valid order just over the auto-approve limit",
    supplier: "Metro",
    lines: [{ product: "Energy drink", quantity: 335 }],
    expectedStatus: "awaiting_approval",
  },
  {
    description: "Negative quantity",
    supplier: "FitFoods",
    lines: [{ product: "Protein bar", quantity: -10 }],
    expectedStatus: "rejected",
  },
];

let failures = 0;

for (const testCase of cases) {
  const result = checkOrder(testCase.supplier, testCase.lines, catalog);
  const passed = result.status === testCase.expectedStatus;
  if (!passed) failures++;

  console.log(`${passed ? "✅" : "❌"} ${testCase.description}`);
  console.log(
    `   expected: ${testCase.expectedStatus}, got: ${result.status}, totalEur: €${result.totalEur.toFixed(2)}`,
  );
  for (const reason of result.reasons) {
    console.log(`   - ${reason}`);
  }
}

console.log(
  failures === 0
    ? `\nAll ${cases.length} guardrail tests passed.`
    : `\n${failures} of ${cases.length} guardrail tests failed.`,
);

if (failures > 0) {
  process.exit(1);
}
