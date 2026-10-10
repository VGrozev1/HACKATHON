// Task A3: generateDay(day) turns the demand model into individual purchase
// attempts, in the card-reader sale event format (S4). Pure and deterministic:
// the same day always gives the same customers, at the same minute.
//
// These are *attempts*. Whether each one becomes a sale depends on the slot
// having unexpired stock at that moment; see stock.ts and history.ts.

import type { ReaderSaleEvent } from "@/lib/sale-event";
import { sofiaTime, type Day } from "./calendar";
import { expectedSlotDemand, HOURLY_PROFILE } from "./demand";
import { MACHINES, productById, slotsFor, type MachineDef } from "./fleet";
import { poisson, rngFor, weightedIndex, type Rng } from "./random";

export const SIM_SEED = process.env.SIM_SEED ?? "vending-demo-v1";

type PaymentMethod = ReaderSaleEvent["PaymentMethod"];

function paymentMethod(rng: Rng, machine: MachineDef): PaymentMethod {
  // Hospital visitors pay cash more often; offices are mostly card.
  const cash = machine.locationType === "HOSPITAL" ? 0.35 : machine.locationType === "OFFICE" ? 0.12 : 0.22;
  const r = rng();
  if (r < cash) return "Cash";
  if (r < cash + 0.12) return "Mobile";
  return "Credit Card";
}

/** All purchase attempts at one machine on one day, in time order. */
export function generateMachineDay(machine: MachineDef, day: Day): ReaderSaleEvent[] {
  const rng = rngFor(SIM_SEED, day, machine.id);
  const slots = slotsFor(machine);
  const profile = HOURLY_PROFILE[machine.locationType];
  const attempts: { at: Date; slotCode: string; productId: string }[] = [];

  for (const slot of slots) {
    const count = poisson(rng, expectedSlotDemand(machine, slots, slot, day));
    for (let i = 0; i < count; i++) {
      const hour = weightedIndex(rng, profile);
      const at = sofiaTime(day, hour, Math.floor(rng() * 60), Math.floor(rng() * 60));
      attempts.push({ at, slotCode: slot.code, productId: slot.productId });
    }
  }

  attempts.sort((a, b) => a.at.getTime() - b.at.getTime());

  const compactDay = day.replaceAll("-", "");
  return attempts.map((a, i) => {
    const product = productById.get(a.productId)!;
    return {
      TransactionId: `sim-${compactDay}-${machine.id}-${String(i + 1).padStart(4, "0")}`,
      MachineId: machine.id,
      MachineName: machine.name,
      ProductSelection: a.slotCode,
      ProductName: product.name,
      SettlementValue: product.price,
      CurrencyCode: "EUR",
      PaymentMethod: paymentMethod(rng, machine),
      AuthorizationDateTimeGMT: a.at.toISOString().replace(".000Z", "Z"),
      Simulated: true,
    };
  });
}

/** Every purchase attempt across the fleet on `day`, in time order. */
export function generateDay(day: Day, machines: MachineDef[] = MACHINES): ReaderSaleEvent[] {
  return machines
    .flatMap((m) => generateMachineDay(m, day))
    .sort((a, b) => a.AuthorizationDateTimeGMT.localeCompare(b.AuthorizationDateTimeGMT));
}
