// A small fake world for the vending-machine agent to operate on.
// Nothing here talks to a real database — it's all in-memory data the
// tools in tools.ts read from (and, for purchase orders, write to).

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
// Two numbers here are deliberately tuned as demo signals for Step 11's
// nightly-suggestions feature: OFF-01's Water barely moves (would take ~50
// days to sell a full 20-unit slot — a classic "slow seller" tying up slot
// capacity), while GYM-01's Energy drink sells fast enough relative to its
// 12-unit capacity that it reliably runs low again within a couple of days
// ("always sells out early"), independent of any weather/holiday effect.
export const avgDailySales: Record<string, Record<string, number>> = {
  "GYM-01": {
    "Water 0.5l": 4.5,
    "Energy drink": 5,
    "Protein bar": 2,
  },
  "OFF-01": {
    "Coffee to go": 6,
    "Sandwich": 5,
    "Water 0.5l": 0.4,
  },
  "HOS-01": {
    "Water 0.5l": 3,
    "Protein bar": 1.5,
    "Sandwich": 2,
  },
};
