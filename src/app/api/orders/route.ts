// GET /api/orders — purchase orders, newest first (A6).
import { connection } from "next/server";
import { listOrders } from "@/lib/data/fleet";

export async function GET() {
  await connection(); // live data: never prerender at build
  return Response.json(await listOrders());
}
