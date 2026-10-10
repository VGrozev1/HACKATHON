import { suppliers, products, warehouse, avgDailySales } from "./mock-data.ts";

export const AUTO_APPROVE_LIMIT_EUR = 300;

export type OrderLine = { product: string; quantity: number };

export type OrderStatus = "rejected" | "awaiting_approval" | "approved";

export type OrderCheckResult = {
  status: OrderStatus;
  totalEur: number;
  reasons: string[];
};

// Sum of average daily sales for a product across every machine — how fast
// the whole fleet could realistically sell through a batch of it.
function totalDailySalesFor(productName: string): number {
  let total = 0;
  for (const machineSales of Object.values(avgDailySales)) {
    total += machineSales[productName] ?? 0;
  }
  return total;
}

export function checkOrder(supplier: string, lines: OrderLine[]): OrderCheckResult {
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

    const dailySales = totalDailySalesFor(productName);
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
