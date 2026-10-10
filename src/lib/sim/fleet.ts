// Task A2: the demo fleet. 20 machines in Sofia, ~30 products, 3 suppliers.
// Plain data, no database: prisma/seed.ts writes it, and the simulator reads it.
// IDs match the mocks (SOF-GYM-01, water-500 …) so switching from mocks is painless.

import type { LocationType } from "@/generated/prisma/enums";

// ─── Suppliers ───────────────────────────────────────────────────────────────

export interface SupplierDef {
  id: string;
  name: string;
  emailTag: string; // demo inbox gets "<inbox>+<tag>@…" so each supplier is distinguishable
  minOrderValue: number; // €
  leadTimeDays: number;
}

export const SUPPLIERS: SupplierDef[] = [
  { id: "sup-drinks", name: "Sofia Beverages Ltd", emailTag: "drinks", minOrderValue: 80, leadTimeDays: 1 },
  { id: "sup-snacks", name: "Balkan Snack Distribution", emailTag: "snacks", minOrderValue: 60, leadTimeDays: 2 },
  { id: "sup-fresh", name: "FreshBox Catering", emailTag: "fresh", minOrderValue: 50, leadTimeDays: 1 },
];

// ─── Products ────────────────────────────────────────────────────────────────

export type Category = "drink" | "energy" | "coffee" | "snack" | "sweet" | "fresh";

export interface ProductDef {
  id: string;
  name: string;
  category: Category;
  cost: number; // € per unit from the supplier
  price: number; // € per unit to the customer
  shelfLifeDays: number;
  supplierId: string;
  /** Relative demand by location type (1 = average). Drives which items sell best where. */
  appeal: Partial<Record<LocationType, number>>;
}

export const PRODUCTS: ProductDef[] = [
  // Drinks: cold drinks react to the weather.
  { id: "water-500", name: "Devin water 0.5 l", category: "drink", cost: 0.32, price: 1.2, shelfLifeDays: 365, supplierId: "sup-drinks", appeal: { GYM: 3.2, OFFICE: 1.6, HOSPITAL: 2.4, UNIVERSITY: 1.5 } },
  { id: "water-sparkling-500", name: "Bankya sparkling 0.5 l", category: "drink", cost: 0.35, price: 1.3, shelfLifeDays: 365, supplierId: "sup-drinks", appeal: { GYM: 0.8, OFFICE: 1.1, HOSPITAL: 0.9, UNIVERSITY: 0.6 } },
  { id: "cola-330", name: "Coca-Cola 330 ml", category: "drink", cost: 0.55, price: 1.8, shelfLifeDays: 270, supplierId: "sup-drinks", appeal: { GYM: 0.4, OFFICE: 1.4, HOSPITAL: 1.2, UNIVERSITY: 1.9 } },
  { id: "cola-zero-330", name: "Coca-Cola Zero 330 ml", category: "drink", cost: 0.55, price: 1.8, shelfLifeDays: 270, supplierId: "sup-drinks", appeal: { GYM: 1.2, OFFICE: 1.3, HOSPITAL: 0.8, UNIVERSITY: 1.1 } },
  { id: "fanta-330", name: "Fanta Orange 330 ml", category: "drink", cost: 0.5, price: 1.7, shelfLifeDays: 270, supplierId: "sup-drinks", appeal: { OFFICE: 0.7, HOSPITAL: 0.8, UNIVERSITY: 1.2 } },
  { id: "icetea-500", name: "Peach ice tea 0.5 l", category: "drink", cost: 0.6, price: 2.0, shelfLifeDays: 240, supplierId: "sup-drinks", appeal: { GYM: 0.9, OFFICE: 1.2, HOSPITAL: 1.0, UNIVERSITY: 1.3 } },
  { id: "juice-orange-330", name: "Orange juice 330 ml", category: "drink", cost: 0.7, price: 2.2, shelfLifeDays: 180, supplierId: "sup-drinks", appeal: { OFFICE: 0.8, HOSPITAL: 1.4, UNIVERSITY: 0.6 } },
  { id: "isotonic-500", name: "Isotonic drink 0.5 l", category: "drink", cost: 0.8, price: 2.5, shelfLifeDays: 300, supplierId: "sup-drinks", appeal: { GYM: 2.2, OFFICE: 0.3, UNIVERSITY: 0.4 } },
  { id: "redbull-250", name: "Red Bull 250 ml", category: "energy", cost: 1.05, price: 2.9, shelfLifeDays: 540, supplierId: "sup-drinks", appeal: { GYM: 1.8, OFFICE: 1.0, HOSPITAL: 0.7, UNIVERSITY: 2.2 } },
  { id: "monster-500", name: "Monster Energy 500 ml", category: "energy", cost: 1.15, price: 3.2, shelfLifeDays: 540, supplierId: "sup-drinks", appeal: { GYM: 1.3, OFFICE: 0.6, UNIVERSITY: 1.6 } },
  { id: "coffee-cold-250", name: "Cold brew coffee 250 ml", category: "coffee", cost: 0.9, price: 2.6, shelfLifeDays: 180, supplierId: "sup-drinks", appeal: { GYM: 0.6, OFFICE: 1.8, HOSPITAL: 1.3, UNIVERSITY: 1.2 } },

  // Snacks: long shelf life, steady sellers.
  { id: "protein-bar", name: "Protein bar 50 g", category: "snack", cost: 1.1, price: 3.0, shelfLifeDays: 270, supplierId: "sup-snacks", appeal: { GYM: 2.6, OFFICE: 0.6, UNIVERSITY: 0.5 } },
  { id: "granola-bar", name: "Oat & honey granola bar", category: "snack", cost: 0.45, price: 1.5, shelfLifeDays: 240, supplierId: "sup-snacks", appeal: { GYM: 1.1, OFFICE: 0.9, HOSPITAL: 1.0, UNIVERSITY: 0.7 } },
  { id: "nuts-mix", name: "Roasted nut mix 60 g", category: "snack", cost: 0.7, price: 2.2, shelfLifeDays: 300, supplierId: "sup-snacks", appeal: { GYM: 1.2, OFFICE: 1.0, HOSPITAL: 0.6 } },
  { id: "chips-salt", name: "Potato chips salted 70 g", category: "snack", cost: 0.55, price: 1.8, shelfLifeDays: 210, supplierId: "sup-snacks", appeal: { OFFICE: 1.1, HOSPITAL: 0.6, UNIVERSITY: 1.8 } },
  { id: "chips-paprika", name: "Potato chips paprika 70 g", category: "snack", cost: 0.55, price: 1.8, shelfLifeDays: 210, supplierId: "sup-snacks", appeal: { OFFICE: 0.9, UNIVERSITY: 1.6 } },
  { id: "crackers", name: "Sesame crackers 80 g", category: "snack", cost: 0.4, price: 1.4, shelfLifeDays: 300, supplierId: "sup-snacks", appeal: { OFFICE: 0.8, HOSPITAL: 1.1, UNIVERSITY: 0.6 } },
  { id: "rice-cakes", name: "Rice cakes with dark chocolate", category: "snack", cost: 0.5, price: 1.6, shelfLifeDays: 240, supplierId: "sup-snacks", appeal: { GYM: 0.9, OFFICE: 0.7 } },
  { id: "choc-milk", name: "Milk chocolate bar 90 g", category: "sweet", cost: 0.6, price: 1.9, shelfLifeDays: 300, supplierId: "sup-snacks", appeal: { OFFICE: 1.3, HOSPITAL: 1.2, UNIVERSITY: 1.4 } },
  { id: "choc-wafer", name: "Chocolate wafer 50 g", category: "sweet", cost: 0.35, price: 1.3, shelfLifeDays: 300, supplierId: "sup-snacks", appeal: { OFFICE: 1.2, HOSPITAL: 1.1, UNIVERSITY: 1.7 } },
  { id: "choc-hazelnut", name: "Hazelnut chocolate bar 50 g", category: "sweet", cost: 0.55, price: 1.8, shelfLifeDays: 300, supplierId: "sup-snacks", appeal: { OFFICE: 1.0, UNIVERSITY: 1.1 } },
  { id: "biscuits", name: "Butter biscuits 100 g", category: "sweet", cost: 0.4, price: 1.4, shelfLifeDays: 270, supplierId: "sup-snacks", appeal: { OFFICE: 0.7, HOSPITAL: 1.3 } },
  { id: "croissant", name: "Cocoa croissant (packed)", category: "sweet", cost: 0.45, price: 1.6, shelfLifeDays: 60, supplierId: "sup-snacks", appeal: { OFFICE: 1.0, HOSPITAL: 1.0, UNIVERSITY: 1.5 } },

  // Fresh: short shelf life, where waste happens.
  { id: "sandwich-chicken", name: "Chicken sandwich", category: "fresh", cost: 1.65, price: 4.2, shelfLifeDays: 3, supplierId: "sup-fresh", appeal: { OFFICE: 1.9, HOSPITAL: 1.8, UNIVERSITY: 1.0 } },
  { id: "sandwich-ham", name: "Ham & cheese sandwich", category: "fresh", cost: 1.45, price: 3.8, shelfLifeDays: 3, supplierId: "sup-fresh", appeal: { OFFICE: 1.4, HOSPITAL: 1.5, UNIVERSITY: 1.2 } },
  { id: "wrap-veggie", name: "Veggie wrap", category: "fresh", cost: 1.55, price: 4.0, shelfLifeDays: 3, supplierId: "sup-fresh", appeal: { GYM: 0.8, OFFICE: 1.0 } },
  { id: "salad-greek", name: "Greek salad", category: "fresh", cost: 1.85, price: 4.8, shelfLifeDays: 2, supplierId: "sup-fresh", appeal: { GYM: 0.7, OFFICE: 1.2, HOSPITAL: 0.9 } },
  { id: "yogurt-fruit", name: "Bulgarian yogurt with fruit", category: "fresh", cost: 0.75, price: 2.2, shelfLifeDays: 7, supplierId: "sup-fresh", appeal: { GYM: 1.0, OFFICE: 1.0, HOSPITAL: 1.4 } },
  { id: "banitsa", name: "Banitsa with cheese", category: "fresh", cost: 0.8, price: 2.4, shelfLifeDays: 2, supplierId: "sup-fresh", appeal: { OFFICE: 1.1, HOSPITAL: 1.2, UNIVERSITY: 1.6 } },
];

export const productById = new Map(PRODUCTS.map((p) => [p.id, p]));

// ─── Machines ────────────────────────────────────────────────────────────────

export interface MachineDef {
  id: string;
  name: string;
  locationType: LocationType;
  address: string;
  lat: number;
  lng: number;
  /** How busy this spot is compared to others of its type (1 = typical). */
  traffic: number;
  investorId?: string;
}

export const MACHINES: MachineDef[] = [
  // Gyms: evening rush, water and protein.
  { id: "SOF-GYM-01", name: "Gym Lozenets", locationType: "GYM", address: "bul. Cherni vrah, Lozenets", lat: 42.6735, lng: 23.3261, traffic: 1.25, investorId: "inv-01" },
  { id: "SOF-GYM-02", name: "Gym Mladost 1", locationType: "GYM", address: "bul. Andrey Lyapchev, Mladost 1", lat: 42.6502, lng: 23.3791, traffic: 1.1 },
  { id: "SOF-GYM-03", name: "Gym Lyulin Center", locationType: "GYM", address: "bul. Tsaritsa Yoanna, Lyulin", lat: 42.7148, lng: 23.2603, traffic: 0.9 },
  { id: "SOF-GYM-04", name: "Gym Studentski Grad", locationType: "GYM", address: "ul. Akad. Boris Stefanov, Studentski grad", lat: 42.6517, lng: 23.3415, traffic: 1.15 },
  { id: "SOF-GYM-05", name: "Gym Druzhba", locationType: "GYM", address: "bul. Tsvetan Lazarov, Druzhba", lat: 42.6655, lng: 23.4002, traffic: 0.8 },
  { id: "SOF-GYM-06", name: "Gym Nadezhda", locationType: "GYM", address: "bul. Lomsko shose, Nadezhda", lat: 42.7331, lng: 23.3011, traffic: 0.85 },
  { id: "SOF-GYM-07", name: "Gym Manastirski Livadi", locationType: "GYM", address: "bul. Bulgaria, Manastirski livadi", lat: 42.6631, lng: 23.2998, traffic: 1.0, investorId: "inv-02" },

  // Offices: lunch rush, empty weekends.
  { id: "SOF-OFF-01", name: "Business Park Sofia, Building 8", locationType: "OFFICE", address: "Business Park Sofia, Mladost 4", lat: 42.6253, lng: 23.3725, traffic: 1.3 },
  { id: "SOF-OFF-02", name: "Capital Fort", locationType: "OFFICE", address: "bul. Tsarigradsko shose 90", lat: 42.6627, lng: 23.3828, traffic: 1.2 },
  { id: "SOF-OFF-03", name: "Sofia Tech Park", locationType: "OFFICE", address: "bul. Tsarigradsko shose 111", lat: 42.6669, lng: 23.3747, traffic: 1.0 },
  { id: "SOF-OFF-04", name: "Serdika Offices", locationType: "OFFICE", address: "bul. Sitnyakovo 48", lat: 42.6921, lng: 23.3532, traffic: 0.95 },
  { id: "SOF-OFF-05", name: "Office Tower Lozenets", locationType: "OFFICE", address: "ul. Srebarna, Lozenets", lat: 42.6688, lng: 23.3218, traffic: 0.9 },
  { id: "SOF-OFF-06", name: "Iztok Business Center", locationType: "OFFICE", address: "bul. Dragan Tsankov, Iztok", lat: 42.6725, lng: 23.3532, traffic: 0.85 },
  { id: "SOF-OFF-07", name: "Geo Milev Offices", locationType: "OFFICE", address: "ul. Shipchenski prohod, Geo Milev", lat: 42.6801, lng: 23.3604, traffic: 0.8 },
  { id: "SOF-OFF-08", name: "Vitosha Blvd Office Hub", locationType: "OFFICE", address: "bul. Vitosha, Center", lat: 42.6889, lng: 23.3194, traffic: 1.05, investorId: "inv-01" },
  { id: "SOF-OFF-09", name: "Paradise Center Offices", locationType: "OFFICE", address: "bul. Cherni vrah 100", lat: 42.6573, lng: 23.3149, traffic: 1.1 },
  { id: "SOF-OFF-10", name: "Boyana Office Park", locationType: "OFFICE", address: "ul. Kumata, Boyana", lat: 42.6452, lng: 23.2702, traffic: 0.75 },

  // Hospitals: steady around the clock.
  { id: "SOF-HOS-01", name: "Alexandrovska Hospital, Lobby", locationType: "HOSPITAL", address: "ul. Georgi Sofiyski 1", lat: 42.6889, lng: 23.3093, traffic: 1.2 },
  { id: "SOF-HOS-02", name: "Lozenets Hospital, Outpatients", locationType: "HOSPITAL", address: "ul. Koziak 1, Lozenets", lat: 42.6648, lng: 23.3268, traffic: 1.0 },

  // University: lectures started 1 October, so demand jumps then.
  { id: "SOF-UNI-01", name: "Sofia University, Rectorate", locationType: "UNIVERSITY", address: "bul. Tsar Osvoboditel 15", lat: 42.6937, lng: 23.3349, traffic: 1.1 },
];

// ─── Slot layouts ────────────────────────────────────────────────────────────
// [slot code, product id, capacity]. One layout per location type; a bigger
// machine would just have more rows.

type Layout = [code: string, productId: string, capacity: number][];

const LAYOUTS: Record<LocationType, Layout> = {
  GYM: [
    ["A1", "water-500", 24], ["A2", "water-500", 24], ["A3", "isotonic-500", 20], ["A4", "cola-zero-330", 20],
    ["B1", "redbull-250", 20], ["B2", "monster-500", 16], ["B3", "icetea-500", 16], ["B4", "coffee-cold-250", 12],
    ["C1", "protein-bar", 15], ["C2", "protein-bar", 15], ["C3", "nuts-mix", 12], ["C4", "granola-bar", 15],
    ["D1", "rice-cakes", 12], ["D2", "yogurt-fruit", 8], ["D3", "wrap-veggie", 8], ["D4", "salad-greek", 6],
  ],
  OFFICE: [
    ["A1", "water-500", 24], ["A2", "water-sparkling-500", 20], ["A3", "cola-330", 20], ["A4", "cola-zero-330", 20],
    ["B1", "icetea-500", 16], ["B2", "coffee-cold-250", 16], ["B3", "redbull-250", 16], ["B4", "juice-orange-330", 12],
    ["C1", "choc-milk", 15], ["C2", "choc-wafer", 15], ["C3", "chips-salt", 12], ["C4", "nuts-mix", 12],
    ["D1", "sandwich-chicken", 10], ["D2", "sandwich-ham", 10], ["D3", "salad-greek", 8], ["D4", "banitsa", 8],
  ],
  HOSPITAL: [
    ["A1", "water-500", 24], ["A2", "water-500", 24], ["A3", "juice-orange-330", 16], ["A4", "icetea-500", 16],
    ["B1", "cola-330", 16], ["B2", "coffee-cold-250", 16], ["B3", "water-sparkling-500", 12], ["B4", "redbull-250", 12],
    ["C1", "crackers", 15], ["C2", "biscuits", 15], ["C3", "choc-milk", 15], ["C4", "granola-bar", 15],
    ["D1", "sandwich-chicken", 10], ["D2", "sandwich-ham", 10], ["D3", "yogurt-fruit", 8], ["D4", "banitsa", 8],
  ],
  UNIVERSITY: [
    ["A1", "cola-330", 24], ["A2", "redbull-250", 20], ["A3", "monster-500", 16], ["A4", "water-500", 20],
    ["B1", "icetea-500", 16], ["B2", "fanta-330", 16], ["B3", "coffee-cold-250", 12], ["B4", "cola-zero-330", 12],
    ["C1", "chips-salt", 15], ["C2", "chips-paprika", 15], ["C3", "choc-wafer", 15], ["C4", "choc-hazelnut", 15],
    ["D1", "croissant", 12], ["D2", "banitsa", 10], ["D3", "sandwich-ham", 10], ["D4", "choc-milk", 12],
  ],
  OTHER: [],
};

export interface SlotDef {
  id: string; // "<machineId>-<code>", see slotIdFor in src/lib/sale-event.ts
  machineId: string;
  code: string;
  productId: string;
  capacity: number;
}

export function slotsFor(machine: MachineDef): SlotDef[] {
  return LAYOUTS[machine.locationType].map(([code, productId, capacity]) => ({
    id: `${machine.id}-${code}`,
    machineId: machine.id,
    code,
    productId,
    capacity,
  }));
}

export const SLOTS: SlotDef[] = MACHINES.flatMap(slotsFor);

// ─── Investors (C7) ──────────────────────────────────────────────────────────

export const INVESTORS = [
  { id: "inv-01", name: "Demo Investor A", payoutModel: "B" as const, payoutValue: 0.2 }, // 20% of revenue
  { id: "inv-02", name: "Demo Investor B", payoutModel: "A" as const, payoutValue: 120 }, // €120/month rent
];
