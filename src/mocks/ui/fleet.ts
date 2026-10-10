// The demo fleet: 20 machines in Sofia, ~30 products, slot layouts and stock.
// Hand-picked so the story shows: 4 machines low on stock, 2 with expiring items,
// 1 offline and 1 whose sales suddenly dropped to zero.

import type { Alert, LocationType, Product, Slot } from "@/types";
import { DEMO_NOW } from "@/lib/format";
import { seeded, seedFrom } from "./random";

export interface MockProduct extends Product {
  category: "water" | "soft" | "energy" | "coffee" | "snack" | "protein" | "fresh";
  supplier: string;
}

export const SUPPLIERS = {
  aqua: "Aqua Distribution",
  snack: "Snack Express",
  fresh: "Fresh Kitchen Sofia",
  coffee: "BG Coffee Co.",
} as const;

export const products: MockProduct[] = [
  { id: "water-500", name: "Devin water 0.5 l", cost: 0.38, price: 1.2, shelfLifeDays: 365, category: "water", supplier: SUPPLIERS.aqua },
  { id: "water-750-sport", name: "Bankya water 0.75 l sport cap", cost: 0.52, price: 1.6, shelfLifeDays: 365, category: "water", supplier: SUPPLIERS.aqua },
  { id: "sparkling-500", name: "Gorna Banya sparkling 0.5 l", cost: 0.41, price: 1.3, shelfLifeDays: 365, category: "water", supplier: SUPPLIERS.aqua },
  { id: "coke-330", name: "Coca-Cola 330 ml", cost: 0.62, price: 1.8, shelfLifeDays: 270, category: "soft", supplier: SUPPLIERS.aqua },
  { id: "coke-zero-330", name: "Coca-Cola Zero 330 ml", cost: 0.62, price: 1.8, shelfLifeDays: 270, category: "soft", supplier: SUPPLIERS.aqua },
  { id: "fanta-330", name: "Fanta Orange 330 ml", cost: 0.6, price: 1.7, shelfLifeDays: 270, category: "soft", supplier: SUPPLIERS.aqua },
  { id: "icetea-500", name: "Fuzetea peach 0.5 l", cost: 0.68, price: 1.9, shelfLifeDays: 240, category: "soft", supplier: SUPPLIERS.aqua },
  { id: "redbull-250", name: "Red Bull 250 ml", cost: 1.05, price: 2.8, shelfLifeDays: 540, category: "energy", supplier: SUPPLIERS.aqua },
  { id: "redbull-sf-250", name: "Red Bull Sugarfree 250 ml", cost: 1.05, price: 2.8, shelfLifeDays: 540, category: "energy", supplier: SUPPLIERS.aqua },
  { id: "monster-500", name: "Monster Energy 500 ml", cost: 1.12, price: 3.0, shelfLifeDays: 540, category: "energy", supplier: SUPPLIERS.aqua },
  { id: "isotonic-500", name: "Powerade isotonic 0.5 l", cost: 0.85, price: 2.3, shelfLifeDays: 300, category: "energy", supplier: SUPPLIERS.aqua },
  { id: "coffee-latte", name: "Nescafé iced latte 250 ml", cost: 0.95, price: 2.5, shelfLifeDays: 180, category: "coffee", supplier: SUPPLIERS.coffee },
  { id: "coffee-espresso", name: "Starbucks Doubleshot 200 ml", cost: 1.4, price: 3.4, shelfLifeDays: 180, category: "coffee", supplier: SUPPLIERS.coffee },
  { id: "coffee-cold-brew", name: "Lavazza cold brew 250 ml", cost: 1.25, price: 3.2, shelfLifeDays: 150, category: "coffee", supplier: SUPPLIERS.coffee },
  { id: "protein-bar-choc", name: "Myprotein bar chocolate 60 g", cost: 1.35, price: 3.5, shelfLifeDays: 240, category: "protein", supplier: SUPPLIERS.snack },
  { id: "protein-bar-pb", name: "Barebells peanut bar 55 g", cost: 1.45, price: 3.7, shelfLifeDays: 240, category: "protein", supplier: SUPPLIERS.snack },
  { id: "protein-shake", name: "Pro Shake vanilla 330 ml", cost: 1.6, price: 4.2, shelfLifeDays: 120, category: "protein", supplier: SUPPLIERS.snack },
  { id: "snickers", name: "Snickers 50 g", cost: 0.48, price: 1.5, shelfLifeDays: 300, category: "snack", supplier: SUPPLIERS.snack },
  { id: "twix", name: "Twix 50 g", cost: 0.48, price: 1.5, shelfLifeDays: 300, category: "snack", supplier: SUPPLIERS.snack },
  { id: "kitkat", name: "KitKat 41.5 g", cost: 0.45, price: 1.4, shelfLifeDays: 300, category: "snack", supplier: SUPPLIERS.snack },
  { id: "lays-paprika", name: "Lay's paprika 70 g", cost: 0.55, price: 1.7, shelfLifeDays: 180, category: "snack", supplier: SUPPLIERS.snack },
  { id: "pringles-orig", name: "Pringles original 40 g", cost: 0.7, price: 2.0, shelfLifeDays: 365, category: "snack", supplier: SUPPLIERS.snack },
  { id: "nuts-mix", name: "Roasted nut mix 50 g", cost: 0.8, price: 2.2, shelfLifeDays: 200, category: "snack", supplier: SUPPLIERS.snack },
  { id: "rice-cakes", name: "Rice cakes dark choc 35 g", cost: 0.5, price: 1.6, shelfLifeDays: 270, category: "snack", supplier: SUPPLIERS.snack },
  { id: "croissant", name: "7Days croissant cocoa", cost: 0.42, price: 1.3, shelfLifeDays: 60, category: "snack", supplier: SUPPLIERS.snack },
  { id: "sandwich-ham", name: "Ham & cheese sandwich", cost: 1.55, price: 3.9, shelfLifeDays: 4, category: "fresh", supplier: SUPPLIERS.fresh },
  { id: "sandwich-chicken", name: "Chicken wrap", cost: 1.85, price: 4.5, shelfLifeDays: 4, category: "fresh", supplier: SUPPLIERS.fresh },
  { id: "salad-greek", name: "Shopska salad bowl", cost: 1.7, price: 4.3, shelfLifeDays: 3, category: "fresh", supplier: SUPPLIERS.fresh },
  { id: "yogurt-granola", name: "Yogurt & granola cup", cost: 0.95, price: 2.6, shelfLifeDays: 10, category: "fresh", supplier: SUPPLIERS.fresh },
  { id: "banitsa", name: "Banitsa with cheese", cost: 0.9, price: 2.4, shelfLifeDays: 2, category: "fresh", supplier: SUPPLIERS.fresh },
  { id: "fruit-cup", name: "Fresh fruit cup", cost: 1.1, price: 2.9, shelfLifeDays: 3, category: "fresh", supplier: SUPPLIERS.fresh },
];

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
  { id: "SOF-GYM-01", name: "Gym Lozenets", locationType: "gym", lat: 42.6745, lng: 23.3268, traffic: 1.3, stockPercent: 34 },
  { id: "SOF-GYM-02", name: "Pulse Mladost", locationType: "gym", lat: 42.6496, lng: 23.379, traffic: 1.2, stockPercent: 66 },
  { id: "SOF-GYM-03", name: "Pulse Lyulin", locationType: "gym", lat: 42.7146, lng: 23.2613, traffic: 0.9, stockPercent: 72 },
  { id: "SOF-GYM-04", name: "Fitness Studentski Grad", locationType: "gym", lat: 42.6505, lng: 23.346, traffic: 1.1, stockPercent: 58 },
  { id: "SOF-GYM-05", name: "Gym Iztok", locationType: "gym", lat: 42.6716, lng: 23.353, traffic: 0.8, stockPercent: 81 },
  { id: "SOF-GYM-06", name: "Pulse Druzhba", locationType: "gym", lat: 42.665, lng: 23.404, traffic: 1.0, stockPercent: 37 },
  { id: "SOF-GYM-07", name: "Gym Nadezhda", locationType: "gym", lat: 42.733, lng: 23.3, traffic: 0.7, stockPercent: 63 },
  { id: "SOF-GYM-08", name: "Boyana Fitness Club", locationType: "gym", lat: 42.642, lng: 23.269, traffic: 0.75, stockPercent: 77 },
  { id: "SOF-OFF-01", name: "Business Park Sofia B4", locationType: "office", lat: 42.6253, lng: 23.3725, traffic: 1.4, stockPercent: 55 },
  { id: "SOF-OFF-02", name: "Capital Fort lobby", locationType: "office", lat: 42.6627, lng: 23.3828, traffic: 1.25, stockPercent: 61, status: "offline" },
  { id: "SOF-OFF-03", name: "Sofia Tech Park", locationType: "office", lat: 42.6672, lng: 23.3713, traffic: 1.0, stockPercent: 28 },
  { id: "SOF-OFF-04", name: "Serdika Offices", locationType: "office", lat: 42.693, lng: 23.353, traffic: 1.1, stockPercent: 69 },
  { id: "SOF-OFF-05", name: "Mall of Sofia offices", locationType: "office", lat: 42.698, lng: 23.308, traffic: 0.9, stockPercent: 74 },
  { id: "SOF-OFF-06", name: "Bulgaria Mall Tower", locationType: "office", lat: 42.664, lng: 23.288, traffic: 0.85, stockPercent: 52 },
  { id: "SOF-OFF-07", name: "Sofia Airport Center", locationType: "office", lat: 42.681, lng: 23.403, traffic: 0.8, stockPercent: 64 },
  { id: "SOF-OFF-08", name: "NDK Business Center", locationType: "office", lat: 42.6845, lng: 23.319, traffic: 0.95, stockPercent: 83 },
  { id: "SOF-OFF-09", name: "Cherni Vrah Offices", locationType: "office", lat: 42.6425, lng: 23.3335, traffic: 0.9, stockPercent: 47 },
  { id: "SOF-OFF-10", name: "Sofia Center Ministries", locationType: "office", lat: 42.6977, lng: 23.3219, traffic: 0.7, stockPercent: 70 },
  { id: "SOF-HOS-01", name: "Tokuda Hospital ER", locationType: "hospital", lat: 42.6604, lng: 23.3147, traffic: 1.0, stockPercent: 31 },
  { id: "SOF-HOS-02", name: "Tokuda Hospital lobby", locationType: "hospital", lat: 42.6628, lng: 23.3195, traffic: 1.15, stockPercent: 59 },
];

export const machineSeedById = new Map(machineSeeds.map((m) => [m.id, m]));

/** Which products each location type stocks, in slot order (A1, A2, ...). */
const layouts: Record<LocationType, string[]> = {
  gym: [
    "water-500", "water-750-sport", "isotonic-500", "redbull-250", "redbull-sf-250", "monster-500",
    "protein-bar-choc", "protein-bar-pb", "protein-shake", "nuts-mix", "rice-cakes", "coffee-espresso",
  ],
  office: [
    "water-500", "sparkling-500", "coke-330", "coke-zero-330", "icetea-500", "coffee-latte", "coffee-cold-brew",
    "snickers", "twix", "lays-paprika", "croissant", "sandwich-ham", "salad-greek", "yogurt-granola",
  ],
  hospital: [
    "water-500", "coke-330", "fanta-330", "icetea-500", "coffee-latte", "snickers", "kitkat",
    "pringles-orig", "sandwich-ham", "sandwich-chicken", "banitsa", "fruit-cup",
  ],
};

/** Slots that are about to expire, so two machines show the "expiring" story. */
const expiringOverrides: Record<string, { productId: string; hours: number }[]> = {
  "SOF-HOS-02": [
    { productId: "sandwich-chicken", hours: 20 },
    { productId: "banitsa", hours: 14 },
  ],
  "SOF-OFF-01": [{ productId: "salad-greek", hours: 30 }],
};

/** Empty slots behind the stock-out alerts. */
const emptyOverrides: Record<string, string[]> = {
  "SOF-GYM-01": ["water-500", "redbull-250"],
  "SOF-OFF-03": ["coffee-latte", "sandwich-ham"],
  "SOF-HOS-01": ["water-500"],
  "SOF-GYM-06": ["protein-bar-choc"],
};

const slotCache = new Map<string, Slot[]>();

export function slotsFor(machineId: string): Slot[] {
  const cached = slotCache.get(machineId);
  if (cached) return cached;
  const seed = machineSeedById.get(machineId);
  if (!seed) return [];
  const rand = seeded(seedFrom(machineId + ":slots"));
  const layout = layouts[seed.locationType];
  const target = seed.stockPercent / 100;
  const expiring = expiringOverrides[machineId] ?? [];
  const empty = emptyOverrides[machineId] ?? [];

  const slots = layout.map((productId, i): Slot => {
    const product = productById.get(productId)!;
    const row = String.fromCharCode(65 + Math.floor(i / 4)); // A, B, C, D
    const code = `${row}${(i % 4) + 1}`;
    const capacity = product.category === "fresh" ? 8 : 10 + Math.floor(rand() * 3) * 2;
    // Only the slots in emptyOverrides are sold out; every other slot keeps at least one unit.
    let quantity = Math.max(1, Math.round(capacity * Math.min(1, Math.max(0, target + (rand() - 0.5) * 0.5))));
    if (empty.includes(productId)) quantity = 0;

    // Fresh food was loaded recently and expires in a few days; packaged goods last months.
    const ageDays = product.category === "fresh" ? rand() * 1.2 : 5 + rand() * 40;
    let expiresInHours = (product.shelfLifeDays - ageDays) * 24;
    const override = expiring.find((e) => e.productId === productId);
    if (override) {
      expiresInHours = override.hours;
      quantity = Math.max(quantity, 4);
    } else if (product.category === "fresh") {
      expiresInHours = Math.max(expiresInHours, 80); // only the overrides are "expiring"
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
  for (let guard = 0; qty !== want && guard < 500; guard++) {
    const s = slots[Math.floor(rand() * slots.length)];
    if (empty.includes(s.product.id)) continue;
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
  for (const slot of slotsFor(machineId)) {
    if (slot.quantity === 0) {
      add("warning", `${slot.product.name} sold out (${slot.id.split("-").pop()})`, "Demand was higher than the last load list planned for");
    }
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
