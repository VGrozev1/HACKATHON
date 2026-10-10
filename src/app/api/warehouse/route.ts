// GET /api/warehouse — where routes start, and units per product in stock, so
// the agent can subtract what we already have before ordering.
import { connection } from "next/server";
import { db } from "@/lib/db";
import { WAREHOUSE } from "@/lib/sim/fleet";

export async function GET() {
  await connection();
  const products = await db.product.findMany({ include: { warehouse: true }, orderBy: { name: "asc" } });
  return Response.json({
    name: WAREHOUSE.name,
    location: { lat: WAREHOUSE.lat, lng: WAREHOUSE.lng },
    products: products.map((p) => ({ product: p.name, product_id: p.id, quantity: p.warehouse?.quantity ?? 0, capacity: p.warehouseCapacity })),
  });
}
