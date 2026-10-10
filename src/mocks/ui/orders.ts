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
    "PO-1041", SUPPLIERS.drinks, "2026-10-09T19:04:12Z", "2026-10-10", "sent_automatically",
    [["water-500", 240], ["redbull-250", 96], ["isotonic-500", 40]],
    ["SOF-GYM-02", "SOF-GYM-04", "SOF-OFF-04"],
    "Weekend restock for gyms. Water demand is up 18% on last week as September training picks up.",
  ),
  order(
    "PO-1040", SUPPLIERS.snacks, "2026-10-09T19:05:40Z", "2026-10-12", "waiting_for_approval",
    [["protein-bar", 120], ["granola-bar", 96], ["choc-milk", 144], ["chips-salt", 96]],
    ["SOF-GYM-01", "SOF-GYM-02", "SOF-GYM-05", "SOF-OFF-09"],
    "Protein bars run out every Tuesday at three gyms. One larger order covers two weeks and meets the €60 minimum easily.",
  ),
  order(
    "PO-1039", SUPPLIERS.fresh, "2026-10-08T19:02:55Z", "2026-10-09", "sent_automatically",
    [["sandwich-ham", 32], ["salad-greek", 16], ["yogurt-fruit", 24]],
    ["SOF-OFF-01", "SOF-OFF-03", "SOF-OFF-04"],
    "Fresh food for office lunches on Friday. Kept quantities tight: Greek salads expire after 2 days.",
  ),
  order(
    "PO-1038", SUPPLIERS.drinks, "2026-10-07T19:06:18Z", "2026-10-08", "approved",
    [["coffee-cold-250", 240], ["cola-330", 96], ["cola-zero-330", 96]],
    ["SOF-OFF-01", "SOF-OFF-02", "SOF-OFF-05", "SOF-OFF-08"],
    "Cold brew sells out by Thursday in four offices. Over the €300 limit, so it waited for approval; approved in Telegram at 07:12.",
  ),
  order(
    "PO-1037", SUPPLIERS.drinks, "2026-10-06T19:03:31Z", "2026-10-07", "approved",
    [["water-500", 480], ["cola-330", 192], ["monster-500", 72]],
    ["SOF-OFF-01", "SOF-OFF-02", "SOF-UNI-01", "SOF-HOS-01", "SOF-HOS-02"],
    "Lectures started on 1 October and Sofia University sales tripled, so I stocked two weeks of drinks while the warehouse has room.",
  ),
  order(
    "PO-1036", SUPPLIERS.snacks, "2026-10-05T19:04:09Z", "2026-10-07", "rejected",
    [["choc-wafer", 240], ["biscuits", 120], ["crackers", 120]],
    ["SOF-HOS-01", "SOF-HOS-02"],
    "Suggested a bigger sweets order for the hospitals. Rejected by the operator: the storage room is being renovated this week.",
  ),
  order(
    "PO-1035", SUPPLIERS.fresh, "2026-10-05T19:02:44Z", "2026-10-06", "sent_automatically",
    [["sandwich-chicken", 24], ["banitsa", 20], ["yogurt-fruit", 16]],
    ["SOF-HOS-01", "SOF-HOS-02"],
    "Hospital fresh food for Monday. The night shift buys banitsa until 04:00, so most of it goes to Alexandrovska.",
  ),
  order(
    "PO-1034", SUPPLIERS.drinks, "2026-10-04T19:03:58Z", "2026-10-05", "sent_automatically",
    [["water-500", 192], ["icetea-500", 96], ["fanta-330", 72]],
    ["SOF-HOS-02", "SOF-OFF-05", "SOF-OFF-10"],
    "Regular weekly drinks top-up for quieter machines, kept small to avoid tying up cash.",
  ),
];

/** The orders tonight's agent run creates (mock mode). */
export function tonightsOrders(): PurchaseOrder[] {
  const created = "2026-10-10T19:00:00Z";
  return [
    order(
      "PO-1042", SUPPLIERS.drinks, created, "2026-10-11", "sent_automatically",
      [["water-500", 240], ["redbull-250", 72], ["isotonic-500", 40]],
      ["SOF-GYM-01", "SOF-GYM-05", "SOF-HOS-01"],
      "Hot weekend ahead (31°C). Gym Lozenets ran out of water last Saturday at 18:10, so I raised its forecast by 30%.",
    ),
    order(
      "PO-1043", SUPPLIERS.snacks, created, "2026-10-12", "waiting_for_approval",
      [["protein-bar", 180], ["nuts-mix", 120], ["granola-bar", 160], ["rice-cakes", 116]],
      ["SOF-GYM-01", "SOF-GYM-05", "SOF-OFF-03"],
      "Protein bars sold out at Gym Druzhba twice this week. Over the €300 limit, so it waits for your approval.",
    ),
    order(
      "PO-1044", SUPPLIERS.fresh, created, "2026-10-11", "sent_automatically",
      [["sandwich-ham", 24], ["sandwich-chicken", 16], ["yogurt-fruit", 24], ["banitsa", 20]],
      ["SOF-OFF-03", "SOF-HOS-01", "SOF-HOS-02"],
      "Fewer sandwiches for Lozenets Hospital (6 of the last 12 expired), more for Sofia Tech Park, where they sold out by 12:40.",
    ),
  ];
}
