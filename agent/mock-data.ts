// A small fake world for the vending-machine agent to operate on, used when
// USE_MOCK=1. tools.ts migrates to the real API one tool at a time (api.md);
// as of now:
//   - machines, stock          → real: list_machines, get_stock, forecast,
//                                 plan_route, create_suggestion all call the
//                                 real /api/machines endpoints when not mocked.
//   - openingHours, hoursSinceLastSale, todaySales, cashReports
//                               → mock-only, dead weight in real mode: the real
//                                 /api/machines already returns richer alerts
//                                 (OFFLINE/ZERO_SALES/CASH_MISMATCH/STOCK_OUT/
//                                 EXPIRING) computed server-side. Kept only so
//                                 check_alerts still has something to detect
//                                 under USE_MOCK=1.
//   - suppliers, products, warehouse
//                               → mock-only in BOTH modes: there's no real
//                                 /api/products, /api/suppliers, or warehouse
//                                 endpoint yet, and create_purchase_order has
//                                 nowhere real to persist an order either way
//                                 (needs a team discussion, not a tools.ts fix).
//   - avgDailySales             → mock-only in both modes: feeds the shelf-life
//                                 math in guardrails.ts's checkOrder, which has
//                                 no real per-product fleet-wide sales rate to
//                                 use instead yet.

export type Coordinates = { lat: number; lng: number };

export type MachineType = "gym" | "office" | "hospital";

export type Machine = {
  id: string;
  name: string;
  type: MachineType;
  location: Coordinates;
};

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

export type StockEntry = {
  product: string; // matches a Product.name below
  count: number;
  capacity: number;
};

// Approximate real-world coordinates around Sofia, so distances in
// plan_route behave like a real delivery route would.
export const warehouse: Warehouse = {
  name: "Central Warehouse",
  location: { lat: 42.6865, lng: 23.4017 },
  capacity: 2000,
  currentStock: 600,
};

export const machines: Machine[] = [
  {
    id: "GYM-01",
    name: "Vitosha Gym",
    type: "gym",
    location: { lat: 42.6818, lng: 23.3188 },
  },
  {
    id: "OFF-01",
    name: "Business Park Office",
    type: "office",
    location: { lat: 42.6177, lng: 23.3801 },
  },
  {
    id: "HOS-01",
    name: "Pirogov Hospital",
    type: "hospital",
    location: { lat: 42.6762, lng: 23.3225 },
  },
];

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

// Current stock per slot, per machine.
// GYM-01 is low on Water and Energy drink; OFF-01 is low on Sandwich and
// Coffee to go; HOS-01 is comfortably stocked everywhere.
export const stock: Record<string, StockEntry[]> = {
  "GYM-01": [
    { product: "Water 0.5l", count: 3, capacity: 20 },
    { product: "Energy drink", count: 0, capacity: 12 },
    { product: "Protein bar", count: 12, capacity: 15 },
  ],
  "OFF-01": [
    { product: "Coffee to go", count: 2, capacity: 20 },
    { product: "Sandwich", count: 1, capacity: 10 },
    { product: "Water 0.5l", count: 15, capacity: 20 },
  ],
  "HOS-01": [
    { product: "Water 0.5l", count: 18, capacity: 20 },
    { product: "Protein bar", count: 10, capacity: 12 },
    { product: "Sandwich", count: 7, capacity: 10 },
  ],
};

// Average units sold per day, per product, per machine — used by forecast().
// Three numbers here are deliberately tuned as demo signals:
// - OFF-01's Water barely moves (would take ~50 days to sell a full
//   20-unit slot — a classic "slow seller" tying up slot capacity).
// - GYM-01's Energy drink sells fast enough relative to its 12-unit
//   capacity that it reliably runs low again within a couple of days
//   ("always sells out early"), independent of any weather/holiday effect.
// - OFF-01's Coffee to go is a genuinely high-volume product (11/day) so
//   check_alerts' "sudden zero" check (Step 12a) has a real >=10/day
//   product to compare today's zero sales against.
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

// ---- Step 12a: data for check_alerts (the real API has no granular-enough
// endpoint for any of this yet — hour-of-last-sale, per-product daily
// actuals, and cash-vs-fiscal reconciliation are all mock-only for now) ---

export type OpeningHours = { open: number; close: number }; // hour of day, 0-24, local time

export const openingHours: Record<string, OpeningHours> = {
  "GYM-01": { open: 6, close: 23 },
  "OFF-01": { open: 8, close: 19 },
  "HOS-01": { open: 0, close: 24 }, // hospital — effectively open round the clock
};

// Hours since each machine's last recorded sale. Demo signal: GYM-01 is
// tuned to look offline (over the 6-hour threshold); the others look fine.
export const hoursSinceLastSale: Record<string, number> = {
  "GYM-01": 7,
  "OFF-01": 1,
  "HOS-01": 2,
};

// Units sold TODAY per product per machine. Demo signal: OFF-01's Coffee
// to go (normally ~11/day) sold zero today — a classic jammed-slot sign.
export const todaySales: Record<string, Record<string, number>> = {
  "GYM-01": { "Water 0.5l": 5, "Energy drink": 4, "Protein bar": 2 },
  "OFF-01": { "Coffee to go": 0, "Sandwich": 4, "Water 0.5l": 0 },
  "HOS-01": { "Water 0.5l": 3, "Protein bar": 1, "Sandwich": 2 },
};

export type CashReport = { cashCollected: number; fiscalReportTotal: number };

// Demo signal: OFF-01 is off by more than the €2 tolerance; the others
// are exact or within tolerance.
export const cashReports: Record<string, CashReport> = {
  "GYM-01": { cashCollected: 42.5, fiscalReportTotal: 42.5 },
  "OFF-01": { cashCollected: 58.3, fiscalReportTotal: 55.1 },
  "HOS-01": { cashCollected: 30.0, fiscalReportTotal: 29.4 },
};
