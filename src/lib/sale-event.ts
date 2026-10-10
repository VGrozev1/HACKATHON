// Task S4 — the sale event format.
//
// The simulator (Todor, A3) emits sales in the same shape a cashless card reader
// (Nayax / Vendon style telemetry) pushes for every vend. Only `toSaleEventRow`
// knows how that shape maps to our database, so switching from the simulator to
// a real machine later means pointing the reader's webhook at
// POST /api/ingest/sale — no other code changes.
//
// Field names follow the reader convention (PascalCase), on purpose: this is the
// wire format, not our internal model.

import { z } from "zod";

export const ReaderSaleEventSchema = z.object({
  TransactionId: z.string(), // unique per vend, used for idempotency
  MachineId: z.string(), // our Machine.id (the reader is configured with it)
  MachineName: z.string().optional(),
  ProductSelection: z.string(), // slot code on the machine, e.g. "A1"
  ProductName: z.string().optional(),
  SettlementValue: z.number(), // amount charged, in major units (2.50)
  CurrencyCode: z.string().default("EUR"),
  PaymentMethod: z.enum(["Credit Card", "Cash", "Mobile"]),
  // When the vend happened, ISO 8601 in UTC, e.g. "2026-10-10T12:34:56Z"
  AuthorizationDateTimeGMT: z.string(),
  Simulated: z.boolean().optional(), // set by our simulator, absent from real readers
});

export type ReaderSaleEvent = z.infer<typeof ReaderSaleEventSchema>;

const paymentTypeByMethod = {
  "Credit Card": "CARD",
  Cash: "CASH",
  Mobile: "MOBILE",
} as const;

// Example, as the simulator should produce it:
export const exampleReaderSaleEvent: ReaderSaleEvent = {
  TransactionId: "sim-20261010-SOF-GYM-01-000123",
  MachineId: "SOF-GYM-01",
  MachineName: "Gym Lozenets",
  ProductSelection: "A1",
  ProductName: "Devin water 0.5 l",
  SettlementValue: 1.8,
  CurrencyCode: "EUR",
  PaymentMethod: "Credit Card",
  AuthorizationDateTimeGMT: "2026-10-10T15:42:07Z",
  Simulated: true,
};

/**
 * Maps a reader event to the fields of a `SaleEvent` row.
 * `productId` has to come from the slot (the reader only knows the slot code),
 * so the caller looks the slot up and passes it in.
 */
export function toSaleEventRow(
  event: ReaderSaleEvent,
  slot: { id: string; productId: string },
) {
  return {
    externalId: event.TransactionId,
    machineId: event.MachineId,
    slotId: slot.id,
    productId: slot.productId,
    price: event.SettlementValue,
    currency: event.CurrencyCode,
    paymentType: paymentTypeByMethod[event.PaymentMethod],
    occurredAt: new Date(event.AuthorizationDateTimeGMT),
    simulated: event.Simulated ?? false,
    raw: event,
  };
}

/** Slot ids are "<machineId>-<code>", see prisma/schema.prisma. */
export function slotIdFor(machineId: string, code: string) {
  return `${machineId}-${code}`;
}
