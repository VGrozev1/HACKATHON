// GET /api/orders — purchase orders, newest first (C5). Stub: A6.
import { connection } from "next/server";
import { mockOrders } from "@/mocks";

export async function GET() {
  await connection(); // always run at request time, never prerender at build (live data)
  return Response.json(mockOrders);
}
