// The demo fleet for mock mode and backup data. Mirrors Todor's simulated fleet
// (src/lib/sim/fleet.ts on todor/data): same machine ids, names, products, suppliers
// and slot layouts, so mock, backup and real data tell the same story.
// On top of that, a hand-picked state for the demo: 4 machines low on stock,
// 2 with expiring food, 1 offline and 1 whose sales suddenly dropped to zero.

import type { Alert, LocationType, Product, Slot } from "@/types";
import { DEMO_NOW } from "@/lib/format";
import { seeded, seedFrom } from "./random";

export interface MockProduct extends Product {
  category: "drink" | "energy" | "coffee" | "snack" | "sweet" | "fresh";
  supplier: string;
}

export const SUPPLIERS = {
  drinks: "Sofia Beverages Ltd",
  snacks: "Balkan Snack Distribution",
  fresh: "FreshBox Catering",
} as const;

type P = [id: string, name: string, category: MockProduct["category"], cost: number, price: number, shelfLifeDays: number, supplier: keyof typeof SUPPLIERS];

const PRODUCT_ROWS: P[] = [
  ["water-500", "Devin water 0.5 l", "drink", 0.32, 1.2, 365, "drinks"],
  ["water-sparkling-500", "Bankya sparkling 0.5 l", "drink", 0.35, 1.3, 365, "drinks"],
  ["cola-330", "Coca-Cola 330 ml", "drink", 0.55, 1.8, 270, "drinks"],
  ["cola-zero-330", "Coca-Cola Zero 330 ml", "drink", 0.55, 1.8, 270, "drinks"],
  ["fanta-330", "Fanta Orange 330 ml", "drink", 0.5, 1.7, 270, "drinks"],
  ["icetea-500", "Peach ice tea 0.5 l", "drink", 0.6, 2.0, 240, "drinks"],
  ["juice-orange-330", "Orange juice 330 ml", "drink", 0.7, 2.2, 180, "drinks"],
  ["isotonic-500", "Isotonic drink 0.5 l", "drink", 0.8, 2.5, 300, "drinks"],
  ["redbull-250", "Red Bull 250 ml", "energy", 1.05, 2.9, 540, "drinks"],
  ["monster-500", "Monster Energy 500 ml", "energy", 1.15, 3.2, 540, "drinks"],
  ["coffee-cold-250", "Cold brew coffee 250 ml", "coffee", 0.9, 2.6, 180, "drinks"],
  ["protein-bar", "Protein bar 50 g", "snack", 1.1, 3.0, 270, "snacks"],
  ["granola-bar", "Oat & honey granola bar", "snack", 0.45, 1.5, 240, "snacks"],
  ["nuts-mix", "Roasted nut mix 60 g", "snack", 0.7, 2.2, 300, "snacks"],
  ["chips-salt", "Potato chips salted 70 g", "snack", 0.55, 1.8, 210, "snacks"],
  ["chips-paprika", "Potato chips paprika 70 g", "snack", 0.55, 1.8, 210, "snacks"],
  ["crackers", "Sesame crackers 80 g", "snack", 0.4, 1.4, 300, "snacks"],
  ["rice-cakes", "Rice cakes with dark chocolate", "snack", 0.5, 1.6, 240, "snacks"],
  ["choc-milk", "Milk chocolate bar 90 g", "sweet", 0.6, 1.9, 300, "snacks"],
  ["choc-wafer", "Chocolate wafer 50 g", "sweet", 0.35, 1.3, 300, "snacks"],
  ["choc-hazelnut", "Hazelnut chocolate bar 50 g", "sweet", 0.55, 1.8, 300, "snacks"],
  ["biscuits", "Butter biscuits 100 g", "sweet", 0.4, 1.4, 270, "snacks"],
  ["croissant", "Cocoa croissant (packed)", "sweet", 0.45, 1.6, 60, "snacks"],
  ["sandwich-chicken", "Chicken sandwich", "fresh", 1.65, 4.2, 3, "fresh"],
  ["sandwich-ham", "Ham & cheese sandwich", "fresh", 1.45, 3.8, 3, "fresh"],
  ["wrap-veggie", "Veggie wrap", "fresh", 1.55, 4.0, 3, "fresh"],
  ["salad-greek", "Greek salad", "fresh", 1.85, 4.8, 2, "fresh"],
  ["yogurt-fruit", "Bulgarian yogurt with fruit", "fresh", 0.75, 2.2, 7, "fresh"],
  ["banitsa", "Banitsa with cheese", "fresh", 0.8, 2.4, 2, "fresh"],
];

export const products: MockProduct[] = PRODUCT_ROWS.map(([id, name, category, cost, price, shelfLifeDays, supplier]) => ({
  id,
  name,
  category,
  cost,
  price,
  shelfLifeDays,
  supplier: SUPPLIERS[supplier],
}));

export const productById = new Map(products.map((p) => [p.id, p]));

interface MachineSeed {
  id: string;
  name: string;
  locationType: LocationType;
  lat: number;
  lng: number;
  /** relative size of the machine's daily sales */
  traffic: number;
  stockPercent: number;
  status?: "offline";
}

export const machineSeeds: MachineSeed[] = [
  { id: "SOF-GYM-01", name: "Gym Lozenets", locationType: "gym", lat: 42.6735, lng: 23.3261, traffic: 1.25, stockPercent: 34 },
  { id: "SOF-GYM-02", name: "Gym Mladost 1", locationType: "gym", lat: 42.6502, lng: 23.3791, traffic: 1.1, stockPercent: 66 },
  { id: "SOF-GYM-03", name: "Gym Lyulin Center", locationType: "gym", lat: 42.7148, lng: 23.2603, traffic: 0.9, stockPercent: 72 },
  { id: "SOF-GYM-04", name: "Gym Studentski Grad", locationType: "gym", lat: 42.6517, lng: 23.3415, traffic: 1.15, stockPercent: 58 },
  { id: "SOF-GYM-05", name: "Gym Druzhba", locationType: "gym", lat: 42.6655, lng: 23.4002, traffic: 0.8, stockPercent: 37 },
  { id: "SOF-GYM-06", name: "Gym Nadezhda", locationType: "gym", lat: 42.7331, lng: 23.3011, traffic: 0.85, stockPercent: 63 },
  { id: "SOF-GYM-07", name: "Gym Manastirski Livadi", locationType: "gym", lat: 42.6631, lng: 23.2998, traffic: 1.0, stockPercent: 77 },
  { id: "SOF-OFF-01", name: "Business Park Sofia, Building 8", locationType: "office", lat: 42.6253, lng: 23.3725, traffic: 1.3, stockPercent: 55 },
  { id: "SOF-OFF-02", name: "Capital Fort", locationType: "office", lat: 42.6627, lng: 23.3828, traffic: 1.2, stockPercent: 61, status: "offline" },
  { id: "SOF-OFF-03", name: "Sofia Tech Park", locationType: "office", lat: 42.6669, lng: 23.3747, traffic: 1.0, stockPercent: 28 },
  { id: "SOF-OFF-04", name: "Serdika Offices", locationType: "office", lat: 42.6921, lng: 23.3532, traffic: 0.95, stockPercent: 69 },
  { id: "SOF-OFF-05", name: "Office Tower Lozenets", locationType: "office", lat: 42.6688, lng: 23.3218, traffic: 0.9, stockPercent: 74 },
  { id: "SOF-OFF-06", name: "Iztok Business Center", locationType: "office", lat: 42.6725, lng: 23.3532, traffic: 0.85, stockPercent: 52 },
  { id: "SOF-OFF-07", name: "Geo Milev Offices", locationType: "office", lat: 42.6801, lng: 23.3604, traffic: 0.8, stockPercent: 64 },
  { id: "SOF-OFF-08", name: "Vitosha Blvd Office Hub", locationType: "office", lat: 42.6889, lng: 23.3194, traffic: 1.05, stockPercent: 83 },
  { id: "SOF-OFF-09", name: "Paradise Center Offices", locationType: "office", lat: 42.6573, lng: 23.3149, traffic: 1.1, stockPercent: 47 },
  { id: "SOF-OFF-10", name: "Boyana Office Park", locationType: "office", lat: 42.6452, lng: 23.2702, traffic: 0.75, stockPercent: 70 },
  { id: "SOF-HOS-01", name: "Alexandrovska Hospital, Lobby", locationType: "hospital", lat: 42.6889, lng: 23.3093, traffic: 1.2, stockPercent: 31 },
  { id: "SOF-HOS-02", name: "Lozenets Hospital, Outpatients", locationType: "hospital", lat: 42.6648, lng: 23.3268, traffic: 1.0, stockPercent: 59 },
  { id: "SOF-UNI-01", name: "Sofia University, Rectorate", locationType: "university", lat: 42.6937, lng: 23.3349, traffic: 1.1, stockPercent: 50 },
];

export const machineSeedById = new Map(machineSeeds.map((m) => [m.id, m]));

/** Slot layouts per location type: [code, product id, capacity], as in Todor's fleet. */
const layouts: Record<LocationType, [string, string, number][]> = {
  gym: [
    ["A1", "water-500", 24], ["A2", "water-500", 24], ["A3", "isotonic-500", 20], ["A4", "cola-zero-330", 20],
    ["B1", "redbull-250", 20], ["B2", "monster-500", 16], ["B3", "icetea-500", 16], ["B4", "coffee-cold-250", 12],
    ["C1", "protein-bar", 15], ["C2", "protein-bar", 15], ["C3", "nuts-mix", 12], ["C4", "granola-bar", 15],
    ["D1", "rice-cakes", 12], ["D2", "yogurt-fruit", 8], ["D3", "wrap-veggie", 8], ["D4", "salad-greek", 6],
  ],
  office: [
    ["A1", "water-500", 24], ["A2", "water-sparkling-500", 20], ["A3", "cola-330", 20], ["A4", "cola-zero-330", 20],
    ["B1", "icetea-500", 16], ["B2", "coffee-cold-250", 16], ["B3", "redbull-250", 16], ["B4", "juice-orange-330", 12],
    ["C1", "choc-milk", 15], ["C2", "choc-wafer", 15], ["C3", "chips-salt", 12], ["C4", "nuts-mix", 12],
    ["D1", "sandwich-chicken", 10], ["D2", "sandwich-ham", 10], ["D3", "salad-greek", 8], ["D4", "banitsa", 8],
  ],
  hospital: [
    ["A1", "water-500", 24], ["A2", "water-500", 24], ["A3", "juice-orange-330", 16], ["A4", "icetea-500", 16],
    ["B1", "cola-330", 16], ["B2", "coffee-cold-250", 16], ["B3", "water-sparkling-500", 12], ["B4", "redbull-250", 12],
    ["C1", "crackers", 15], ["C2", "biscuits", 15], ["C3", "choc-milk", 15], ["C4", "granola-bar", 15],
    ["D1", "sandwich-chicken", 10], ["D2", "sandwich-ham", 10], ["D3", "yogurt-fruit", 8], ["D4", "banitsa", 8],
  ],
  university: [
    ["A1", "cola-330", 24], ["A2", "redbull-250", 20], ["A3", "monster-500", 16], ["A4", "water-500", 20],
    ["B1", "icetea-500", 16], ["B2", "fanta-330", 16], ["B3", "coffee-cold-250", 12], ["B4", "cola-zero-330", 12],
    ["C1", "chips-salt", 15], ["C2", "chips-paprika", 15], ["C3", "choc-wafer", 15], ["C4", "choc-hazelnut", 15],
    ["D1", "croissant", 12], ["D2", "banitsa", 10], ["D3", "sandwich-ham", 10], ["D4", "choc-milk", 12],
  ],
};

/** Slots that are about to expire, so two machines show the "expiring" story. */
const expiringOverrides: Record<string, { code: string; hours: number }[]> = {
  "SOF-HOS-02": [
    { code: "D1", hours: 20 }, // chicken sandwiches
    { code: "D4", hours: 14 }, // banitsa
  ],
  "SOF-OFF-01": [{ code: "D3", hours: 30 }], // Greek salad
};

/** Empty slots behind the stock-out alerts. */
const emptyOverrides: Record<string, string[]> = {
  "SOF-GYM-01": ["A1", "A2", "B1"], // water and Red Bull
  "SOF-OFF-03": ["B2", "D2"], // cold brew and ham sandwiches
  "SOF-HOS-01": ["A1"], // water
  "SOF-GYM-05": ["C1", "C2"], // protein bars
};

const slotCache = new Map<string, Slot[]>();

export function slotsFor(machineId: string): Slot[] {
  const cached = slotCache.get(machineId);
  if (cached) return cached;
  const seed = machineSeedById.get(machineId);
  if (!seed) return [];
  const rand = seeded(seedFrom(machineId + ":slots"));
  const target = seed.stockPercent / 100;
  const expiring = expiringOverrides[machineId] ?? [];
  const empty = emptyOverrides[machineId] ?? [];

  const slots = layouts[seed.locationType].map(([code, productId, capacity]): Slot => {
    const product = productById.get(productId)!;
    // Only the slots in emptyOverrides are sold out; every other slot keeps at least one unit.
    let quantity = Math.max(1, Math.round(capacity * Math.min(1, Math.max(0, target + (rand() - 0.5) * 0.5))));
    if (empty.includes(code)) quantity = 0;

    // Fresh food was loaded recently and expires in a few days; packaged goods last months.
    const ageDays = product.category === "fresh" ? rand() * 0.5 : 5 + rand() * 40;
    let expiresInHours = (product.shelfLifeDays - ageDays) * 24;
    const override = expiring.find((e) => e.code === code);
    if (override) {
      expiresInHours = override.hours;
      quantity = Math.max(quantity, 4);
    } else if (product.category === "fresh") {
      expiresInHours = Math.max(expiresInHours, 54); // only the overrides are "expiring"
    }
    return {
      id: `${machineId}-${code}`,
      machineId,
      product: {
        id: product.id,
        name: product.name,
        cost: product.cost,
        price: product.price,
        shelfLifeDays: product.shelfLifeDays,
      },
      capacity,
      quantity,
      expiryDate: new Date(DEMO_NOW.getTime() + expiresInHours * 3_600_000).toISOString(),
    };
  });

  // Rescale so units / capacity matches the machine's headline stock %.
  const cap = slots.reduce((s, x) => s + x.capacity, 0);
  let qty = slots.reduce((s, x) => s + x.quantity, 0);
  const want = Math.round(cap * target);
  const locked = new Set([...empty, ...expiring.map((e) => e.code)].map((c) => `${machineId}-${c}`));
  for (let guard = 0; qty !== want && guard < 2000; guard++) {
    const s = slots[Math.floor(rand() * slots.length)];
    if (locked.has(s.id)) continue;
    if (qty < want && s.quantity < s.capacity) {
      s.quantity++;
      qty++;
    } else if (qty > want && s.quantity > 1) {
      s.quantity--;
      qty--;
    }
  }
  slotCache.set(machineId, slots);
  return slots;
}

export function stockPercentFor(machineId: string): number {
  const slots = slotsFor(machineId);
  const cap = slots.reduce((s, x) => s + x.capacity, 0);
  const qty = slots.reduce((s, x) => s + x.quantity, 0);
  return cap ? Math.round((qty / cap) * 100) : 0;
}

export function alertsFor(machineId: string): Alert[] {
  const alerts: Alert[] = [];
  const add = (severity: Alert["severity"], title: string, likelyCause: string) =>
    alerts.push({ id: `${machineId}-alert-${alerts.length + 1}`, machineId, severity, title, likelyCause });

  const seed = machineSeedById.get(machineId);
  if (!seed) return alerts;

  if (seed.status === "offline") {
    add("critical", "Machine offline since 09:42", "Card reader lost its mobile connection; the machine may still take cash");
  }
  if (machineId === "SOF-OFF-07") {
    add("critical", "Sales suddenly at zero since 11:20", "Usually ~9 sales by now. Bill acceptor jammed or the front door was left open");
  }
  // One alert per sold-out product, even when it fills two slots (water in A1 and A2).
  const soldOut = new Map<string, string[]>();
  for (const slot of slotsFor(machineId)) {
    if (slot.quantity === 0) soldOut.set(slot.product.name, [...(soldOut.get(slot.product.name) ?? []), slot.id.split("-").pop()!]);
  }
  for (const [name, codes] of soldOut) {
    add("warning", `${name} sold out (${codes.join(", ")})`, "Demand was higher than the last load list planned for");
  }
  for (const slot of slotsFor(machineId)) {
    const hoursLeft = (new Date(slot.expiryDate).getTime() - DEMO_NOW.getTime()) / 3_600_000;
    if (hoursLeft <= 48 && slot.quantity > 0) {
      add(
        "warning",
        `${slot.quantity} × ${slot.product.name} expire within ${Math.max(1, Math.round(hoursLeft))} h`,
        "Loaded for a busier week; sells about 2 a day here",
      );
    }
  }
  const stock = stockPercentFor(machineId);
  if (stock < 40) {
    add("info", `Stock at ${stock}%`, "Sold faster than planned since the last visit; below the 40% restock threshold");
  }
  return alerts;
}
