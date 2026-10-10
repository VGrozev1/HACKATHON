// POST /api/ingest/sale — receives one card-reader sale event (S4 format) and stores it.
// The simulator can post here too; a real machine's reader webhook would point here.
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ReaderSaleEventSchema, slotIdFor, toSaleEventRow } from "@/lib/sale-event";

export async function POST(req: NextRequest) {
  const parsed = ReaderSaleEventSchema.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });

  const event = parsed.data;
  const slot = await db.slot.findUnique({
    where: { id: slotIdFor(event.MachineId, event.ProductSelection) },
  });
  if (!slot) return Response.json({ error: "Unknown machine or slot" }, { status: 404 });

  const row = toSaleEventRow(event, slot);
  // Readers retry; the transaction id makes this idempotent.
  const sale = await db.saleEvent.upsert({
    where: { externalId: row.externalId },
    create: row,
    update: {},
  });
  return Response.json({ id: sale.id }, { status: 201 });
}
