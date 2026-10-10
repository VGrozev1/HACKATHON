// GET /api/catalog — suppliers and products the agent may order (names, costs,
// shelf life, minimum orders). Orders must use these names or ids.
import { connection } from "next/server";
import { loadCatalog } from "@/lib/data/agent-api";

export async function GET() {
  await connection();
  const { suppliers, products } = await loadCatalog();
  return Response.json({
    suppliers: suppliers.map((s) => ({ id: s.id, name: s.name, min_order_eur: s.minOrderValue, lead_time_days: s.leadTimeDays, approved: s.approved })),
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      supplier: p.supplier.name,
      supplier_id: p.supplierId,
      cost_eur: p.cost,
      price_eur: p.price,
      shelf_life_days: p.shelfLifeDays,
      warehouse_capacity: p.warehouseCapacity,
    })),
  });
}
