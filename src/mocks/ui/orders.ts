// Purchase orders from the last few nights, plus the three the agent creates tonight.

import type { PurchaseOrder } from "@/types";
import { productById, SUPPLIERS } from "./fleet";
import { round2 } from "./random";

type LineSeed = [productId: string, quantity: number];

function order(
  id: string,
  supplier: string,
  createdAt: string,
  deliveryDate: string,
  status: PurchaseOrder["status"],
  lines: LineSeed[],
  machineIds: string[],
  explanation: string,
): PurchaseOrder {
  const full = lines.map(([productId, quantity]) => {
    const p = productById.get(productId)!;
    return { product: p.name, quantity, unitCost: p.cost };
  });
  const total = round2(full.reduce((s, l) => s + l.quantity * l.unitCost, 0));
  return { id, supplier, createdAt, deliveryDate, total, status, lines: full, machineIds, explanation };
}

export const pastOrders: PurchaseOrder[] = [
  order(
    "PO-1041", SUPPLIERS.aqua, "2026-10-09T19:04:12Z", "2026-10-11", "sent_automatically",
    [["water-500", 240], ["redbull-250", 96], ["isotonic-500", 40]],
    ["SOF-GYM-02", "SOF-GYM-04", "SOF-OFF-04"],
    "Weekend restock for gyms. Water demand is up 18% on last week as September training picks up.",
  ),
  order(
    "PO-1040", SUPPLIERS.snack, "2026-10-09T19:05:40Z", "2026-10-12", "waiting_for_approval",
    [["protein-bar-choc", 96], ["protein-bar-pb", 72], ["snickers", 144], ["lays-paprika", 96]],
    ["SOF-GYM-01", "SOF-GYM-02", "SOF-GYM-06", "SOF-OFF-09"],
    "Protein bars run out every Tuesday at three gyms. One larger order covers two weeks and meets Snack Express's €150 minimum.",
  ),
  order(
    "PO-1039", SUPPLIERS.fresh, "2026-10-08T19:02:55Z", "2026-10-09", "sent_automatically",
    [["sandwich-ham", 32], ["salad-greek", 16], ["yogurt-granola", 24]],
    ["SOF-OFF-01", "SOF-OFF-03", "SOF-OFF-04"],
    "Fresh food for office lunches Friday. Kept quantities tight: salads expire after 3 days.",
  ),
  order(
    "PO-1038", SUPPLIERS.coffee, "2026-10-07T19:06:18Z", "2026-10-09", "approved",
    [["coffee-latte", 144], ["coffee-espresso", 72], ["coffee-cold-brew", 48]],
    ["SOF-OFF-01", "SOF-OFF-02", "SOF-OFF-05", "SOF-OFF-08"],
    "Monthly coffee drinks order. Over the €300 limit, so it waited for approval; approved in Telegram at 07:12.",
  ),
  order(
    "PO-1037", SUPPLIERS.aqua, "2026-10-06T19:03:31Z", "2026-10-08", "approved",
    [["water-500", 480], ["coke-330", 192], ["coke-zero-330", 96], ["monster-500", 72]],
    ["SOF-OFF-01", "SOF-OFF-02", "SOF-OFF-03", "SOF-HOS-01", "SOF-HOS-02"],
    "Bulk drinks before the price list changes on 15 Oct; warehouse has room for 2 weeks of stock.",
  ),
  order(
    "PO-1036", SUPPLIERS.snack, "2026-10-05T19:04:09Z", "2026-10-07", "rejected",
    [["kitkat", 120], ["twix", 120], ["pringles-orig", 96]],
    ["SOF-HOS-01", "SOF-HOS-02"],
    "Suggested a bigger chocolate order for the hospital. Rejected by the operator: storage room is being renovated this week.",
  ),
  order(
    "PO-1035", SUPPLIERS.fresh, "2026-10-05T19:02:44Z", "2026-10-06", "sent_automatically",
    [["sandwich-chicken", 24], ["banitsa", 20], ["fruit-cup", 16]],
    ["SOF-HOS-01", "SOF-HOS-02"],
    "Hospital fresh food for Monday. Night shift buys banitsa until 04:00, so it goes in the ER machine.",
  ),
  order(
    "PO-1034", SUPPLIERS.aqua, "2026-10-04T19:03:58Z", "2026-10-06", "sent_automatically",
    [["water-500", 192], ["icetea-500", 96], ["fanta-330", 72]],
    ["SOF-HOS-02", "SOF-OFF-05", "SOF-OFF-10"],
    "Regular weekly drinks top-up for low-traffic machines, kept small to avoid tying up cash.",
  ),
];

/** The orders tonight's agent run creates (mock mode). */
export function tonightsOrders(): PurchaseOrder[] {
  const created = "2026-10-10T19:00:00Z";
  return [
    order(
      "PO-1042", SUPPLIERS.aqua, created, "2026-10-11", "sent_automatically",
      [["water-500", 192], ["redbull-250", 72], ["water-750-sport", 48], ["isotonic-500", 12]],
      ["SOF-GYM-01", "SOF-GYM-06", "SOF-HOS-01"],
      "Hot weekend ahead (31°C). Gym Lozenets ran out of water last Saturday at 18:10, so I raised its forecast by 30%.",
    ),
    order(
      "PO-1043", SUPPLIERS.snack, created, "2026-10-12", "waiting_for_approval",
      [["protein-bar-choc", 120], ["protein-bar-pb", 96], ["snickers", 120], ["nuts-mix", 66]],
      ["SOF-GYM-01", "SOF-GYM-06", "SOF-OFF-03"],
      "Protein bars sold out at Pulse Druzhba twice this week. Over the €300 limit, so it waits for your approval.",
    ),
    order(
      "PO-1044", SUPPLIERS.fresh, created, "2026-10-11", "sent_automatically",
      [["sandwich-ham", 24], ["sandwich-chicken", 16], ["fruit-cup", 16], ["yogurt-granola", 12]],
      ["SOF-OFF-03", "SOF-HOS-01", "SOF-HOS-02"],
      "Fewer sandwiches for Tokuda lobby (6 of the last 12 expired), more for Sofia Tech Park, where they sold out by 12:40.",
    ),
  ];
}
