export const AUTO_APPROVE_LIMIT_EUR = 300;

export type OrderLine = { product: string; quantity: number };

export type OrderStatus = "rejected" | "awaiting_approval" | "approved";

export type OrderCheckResult = {
  status: OrderStatus;
  totalEur: number;
  reasons: string[];
};

// The catalogs checkOrder needs. None of these have a real endpoint yet
// (no /api/products, /api/suppliers, or warehouse route) — the caller
// (tools.ts) is where that's decided, so this file stays pure and doesn't
// care whether its data came from mock-data.ts or somewhere real later.
export type OrderCatalog = {
  suppliers: { name: string; minOrderEur: number }[];
  products: { name: string; supplier: string; costEur: number; shelfLifeDays: number }[];
  warehouse: { capacity: number; currentStock: number };
  // machineId -> product name -> average units sold per day.
  avgDailySales: Record<string, Record<string, number>>;
};

// Sum of average daily sales for a product across every machine — how fast
// the whole fleet could realistically sell through a batch of it.
function totalDailySalesFor(avgDailySales: OrderCatalog["avgDailySales"], productName: string): number {
  let total = 0;
  for (const machineSales of Object.values(avgDailySales)) {
    total += machineSales[productName] ?? 0;
  }
  return total;
}

export function checkOrder(supplier: string, lines: OrderLine[], catalog: OrderCatalog): OrderCheckResult {
  const { suppliers, products, warehouse, avgDailySales } = catalog;
  const reasons: string[] = [];
  let totalEur = 0;
  let totalQuantity = 0;

  const supplierInfo = suppliers.find((s) => s.name === supplier);
  if (!supplierInfo) {
    reasons.push(
      `"${supplier}" is not an approved supplier. Approved suppliers: ${suppliers
        .map((s) => s.name)
        .join(", ")}.`,
    );
  }

  for (const line of lines) {
    const { product: productName, quantity } = line;
    const quantityValid = Number.isInteger(quantity) && quantity >= 1 && quantity <= 1000;

    if (!quantityValid) {
      reasons.push(
        `Quantity for "${productName}" must be a whole number between 1 and 1000, got ${quantity}.`,
      );
    } else {
      totalQuantity += quantity;
    }

    const product = products.find((p) => p.name === productName);
    if (!product) {
      reasons.push(
        `"${productName}" is not a product we carry. Known products: ${products
          .map((p) => p.name)
          .join(", ")}.`,
      );
      continue; // can't check cost/expiry for a product we don't recognize
    }

    if (product.supplier !== supplier) {
      reasons.push(
        `"${productName}" is supplied by "${product.supplier}", not "${supplier}".`,
      );
      continue; // this line can't be fulfilled from this supplier at all
    }

    if (!quantityValid) continue; // don't trust cost/expiry math on a bad quantity

    totalEur += quantity * product.costEur;

    const dailySales = totalDailySalesFor(avgDailySales, productName);
    const daysToSellThrough = dailySales > 0 ? quantity / dailySales : Infinity;
    if (daysToSellThrough >= product.shelfLifeDays) {
      reasons.push(
        `Ordering ${quantity} "${productName}" would take ${
          Number.isFinite(daysToSellThrough) ? daysToSellThrough.toFixed(1) : "forever"
        } days to sell through across all machines (${dailySales}/day combined), but it only keeps for ${product.shelfLifeDays} days.`,
      );
    }
  }

  if (warehouse.currentStock + totalQuantity > warehouse.capacity) {
    reasons.push(
      `The warehouse only has ${
        warehouse.capacity - warehouse.currentStock
      } units of free space, but this order adds ${totalQuantity}.`,
    );
  }

  if (supplierInfo && totalEur < supplierInfo.minOrderEur) {
    reasons.push(
      `Order total is €${totalEur.toFixed(2)}, below "${supplier}"'s minimum order of €${supplierInfo.minOrderEur}.`,
    );
  }

  if (reasons.length > 0) {
    return { status: "rejected", totalEur, reasons };
  }

  const status: OrderStatus =
    totalEur > AUTO_APPROVE_LIMIT_EUR ? "awaiting_approval" : "approved";
  return { status, totalEur, reasons: [] };
}

export const MAX_SUGGESTIONS_PER_NIGHT = 5;
export const MAX_PRICE_CHANGE_PERCENT = 15;

export type SuggestionType = "extra_stock" | "product_swap" | "price_change" | "visit_change";

export type SuggestionInput = {
  type: SuggestionType;
  machineId: string;
  product?: string;
  // Only meaningful (and required) when type is "price_change" — the
  // proposed change, e.g. -10 for a 10% discount, 12 for a 12% increase.
  // Not part of the tool's literal field list in the guide, but there's no
  // other way to enforce a numeric ±15% cap in code without one.
  percentChange?: number;
};

export type SuggestionCheckResult = {
  status: "pending" | "rejected";
  reasons: string[];
};

// Machines come from the real fleet list when one's available (tools.ts
// decides); products still only exist in mock-data.ts — no real catalog yet.
export type SuggestionCatalog = {
  machines: { id: string }[];
  products: { name: string }[];
};

export function checkSuggestion(
  input: SuggestionInput,
  pendingSuggestionsSoFarTonight: number,
  catalog: SuggestionCatalog,
): SuggestionCheckResult {
  const { machines, products } = catalog;
  const reasons: string[] = [];

  if (pendingSuggestionsSoFarTonight >= MAX_SUGGESTIONS_PER_NIGHT) {
    reasons.push(
      `Already have ${MAX_SUGGESTIONS_PER_NIGHT} suggestions tonight — not adding another.`,
    );
  }

  const machine = machines.find((m) => m.id === input.machineId);
  if (!machine) {
    reasons.push(`Unknown machine ID "${input.machineId}"`);
  }

  if (input.product !== undefined) {
    const product = products.find((p) => p.name === input.product);
    if (!product) {
      reasons.push(
        `"${input.product}" is not a product we carry. Known products: ${products
          .map((p) => p.name)
          .join(", ")}.`,
      );
    }
  }

  if (input.type === "price_change") {
    // "only for approved products" — the unknown-product check above
    // already rejects this if input.product isn't in our catalog.
    if (input.product === undefined) {
      reasons.push(`A price_change suggestion must name a product.`);
    }

    if (input.percentChange === undefined) {
      reasons.push(`A price_change suggestion must include a percentChange.`);
    } else if (Math.abs(input.percentChange) > MAX_PRICE_CHANGE_PERCENT) {
      reasons.push(
        `Price changes can be at most ±${MAX_PRICE_CHANGE_PERCENT}% — got ${input.percentChange}%.`,
      );
    }
  }

  if (reasons.length > 0) {
    return { status: "rejected", reasons };
  }
  return { status: "pending", reasons: [] };
}
