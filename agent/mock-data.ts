// What's left of the fake fleet, now that list_machines, get_stock,
// forecast, plan_route, and check_alerts always call the real API (no
// USE_MOCK branch anymore — see tools.ts). What remains here is mock-only
// in BOTH modes, because there's no real source to switch to yet:
//   - suppliers, products, warehouse — no real /api/products,
//     /api/suppliers, or warehouse endpoint. create_purchase_order also
//     has nowhere real to persist an order either way (only GET /api/orders
//     and POST /api/orders/:id/approve exist, for orders that already
//     exist). Needs a team discussion/new endpoints, not a tools.ts fix.
//   - avgDailySales — feeds checkOrder's shelf-life math; no real
//     per-product fleet-wide sales rate exists to use instead yet.
// For list_machines/get_stock/forecast/plan_route/check_alerts testing
// without a live API, see test-tools-live.ts instead of USE_MOCK.

export type Coordinates = { lat: number; lng: number };

export type Warehouse = {
  name: string;
  location: Coordinates;
  capacity: number;
  currentStock: number;
};

export type Supplier = {
  name: string;
  email: string;
  minOrderEur: number;
};

export type Product = {
  name: string;
  supplier: string; // matches a Supplier.name below
  costEur: number;
  shelfLifeDays: number;
};

// Approximate real-world coordinates around Sofia, so distances in
// plan_route behave like a real delivery route would.
export const warehouse: Warehouse = {
  name: "Central Warehouse",
  location: { lat: 42.6865, lng: 23.4017 },
  capacity: 2000,
  currentStock: 600,
};

export const suppliers: Supplier[] = [
  { name: "Metro", email: "orders@metro-sofia.bg", minOrderEur: 150 },
  { name: "FitFoods", email: "supply@fitfoods.bg", minOrderEur: 80 },
  { name: "FreshCo", email: "orders@freshco.bg", minOrderEur: 50 },
];

export const products: Product[] = [
  { name: "Water 0.5l", supplier: "FreshCo", costEur: 0.3, shelfLifeDays: 365 },
  { name: "Energy drink", supplier: "Metro", costEur: 0.9, shelfLifeDays: 240 },
  { name: "Protein bar", supplier: "FitFoods", costEur: 1.2, shelfLifeDays: 180 },
  { name: "Sandwich", supplier: "FreshCo", costEur: 2.5, shelfLifeDays: 3 },
  { name: "Coffee to go", supplier: "Metro", costEur: 1.8, shelfLifeDays: 10 },
];

// Average units sold per day, per product, per machine — feeds checkOrder's
// shelf-life guardrail math. Keyed by the mock machine IDs this data was
// originally written for (GYM-01/OFF-01/HOS-01); it's summed across all
// machines regardless of key, so it still works as a fleet-wide rate even
// though real machine IDs look different (e.g. SOF-GYM-01).
export const avgDailySales: Record<string, Record<string, number>> = {
  "GYM-01": {
    "Water 0.5l": 4.5,
    "Energy drink": 5,
    "Protein bar": 2,
  },
  "OFF-01": {
    "Coffee to go": 11,
    "Sandwich": 5,
    "Water 0.5l": 0.4,
  },
  "HOS-01": {
    "Water 0.5l": 3,
    "Protein bar": 1.5,
    "Sandwich": 2,
  },
};
