// Owner portal mocks: weekly profit per machine and the agent's suggestions to its owner.
// Same cost model as the investor statement (src/mocks/ui/investor.ts).

import type { AgentSuggestion, ProfitWeek } from "@/types";
import { addDays, DEMO_NOW } from "@/lib/format";
import { machineSeedById, slotsFor, stockPercentFor } from "./fleet";
import { salesFor } from "./sales";
import { round2 } from "./random";

const COGS_SHARE = 0.38;
const CARD_FEES = 0.018;
/** Rent, servicing and telemetry, spread over the days of a month. */
const FIXED_PER_DAY = (90 + 110 + 15) / 30;

const mondayOf = (day: string) => {
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(day, dow === 0 ? -6 : 1 - dow);
};

/** The last 8 weeks, oldest first; the current week is partial (up to today). */
export function profitWeeksFor(machineId: string): ProfitWeek[] {
  const byWeek = new Map<string, { revenue: number; days: number }>();
  for (const d of salesFor(machineId, 60)) {
    const w = mondayOf(d.date);
    const cur = byWeek.get(w) ?? { revenue: 0, days: 0 };
    byWeek.set(w, { revenue: cur.revenue + d.revenue, days: cur.days + 1 });
  }
  return [...byWeek.entries()]
    .filter(([, v]) => v.days >= 4) // skip a stub week at the start of the window
    .slice(-8)
    .map(([weekStart, v]) => {
      const costs = v.revenue * (COGS_SHARE + CARD_FEES) + FIXED_PER_DAY * v.days;
      return { weekStart, revenue: round2(v.revenue), costs: round2(costs), profit: round2(v.revenue - costs) };
    });
}

/** Rule-based stand-ins for what the agent would suggest to this machine's owner. */
export function suggestionsFor(machineId: string): AgentSuggestion[] {
  const seed = machineSeedById.get(machineId);
  if (!seed) return [];
  const slots = slotsFor(machineId);
  const dailyUnits = salesFor(machineId, 28).reduce((s, d) => s + d.units, 0) / 28;
  const perSlot = dailyUnits / slots.length;
  const out: AgentSuggestion[] = [];
  const add = (s: Omit<AgentSuggestion, "id" | "machineId" | "status">) =>
    out.push({ ...s, id: `${machineId}-sg-${out.length + 1}`, machineId, status: "open" });

  if (seed.status === "offline") {
    add({
      kind: "service",
      title: "Book a technician for the card reader",
      reason: "The machine has been offline since 09:42. Card sales are lost while it is down; cash still works.",
      impactPerMonth: round2(perSlot * slots.length * 2.2 * 30 * 0.25),
      confidence: "high",
    });
  }
  if (machineId === "SOF-OFF-07") {
    add({
      kind: "service",
      title: "Check the bill acceptor today",
      reason: "Sales stopped at 11:20 although the machine is online. That pattern usually means a jammed bill acceptor or an open door.",
      impactPerMonth: round2(perSlot * slots.length * 2.1 * 30 * 0.3),
      confidence: "medium",
    });
  }

  // A product that sells out: raise its price a little.
  const soldOut = slots.find((s) => s.quantity === 0);
  if (soldOut) {
    const p = soldOut.product;
    const newPrice = round2(p.price + 0.2);
    const sameSlots = slots.filter((s) => s.product.id === p.id).length;
    add({
      kind: "price",
      title: `Raise ${p.name} from €${p.price.toFixed(2)} to €${newPrice.toFixed(2)}`,
      reason: `It sold out before the last visit, so demand is higher than the shelf. A small rise keeps most buyers and pays for an extra restock.`,
      impactPerMonth: round2(perSlot * sameSlots * 1.6 * 0.2 * 30 * 0.9),
      confidence: "medium",
    });
  }

  // Fresh food that expires: give the slot to something that sells.
  const expiring = slots.find(
    (s) => s.product.shelfLifeDays <= 3 && s.quantity > 0 && new Date(s.expiryDate).getTime() - DEMO_NOW.getTime() < 48 * 3_600_000,
  );
  const fresh = expiring ?? slots.find((s) => s.product.shelfLifeDays <= 3);
  const best = slots[0];
  if (fresh && best && fresh.product.id !== best.product.id) {
    add({
      kind: "swap",
      title: `Swap ${fresh.product.name} (${fresh.id.split("-").pop()}) for another ${best.product.name} slot`,
      reason: expiring
        ? `${expiring.quantity} are about to expire unsold. ${best.product.name} is this machine's best seller and lasts months.`
        : `Fresh food here sells slowly and some expires; ${best.product.name} is the best seller and never goes off.`,
      impactPerMonth: round2(perSlot * 30 * (best.product.price - best.product.cost) * 0.8 + fresh.capacity * 0.3 * fresh.product.cost * 4),
      confidence: expiring ? "high" : "medium",
    });
  }

  // Restock rhythm.
  const stock = stockPercentFor(machineId);
  if (stock < 40) {
    add({
      kind: "restock",
      title: seed.locationType === "gym" ? "Add a Friday evening visit" : "Move the weekly visit to Monday morning",
      reason:
        seed.locationType === "gym"
          ? `Stock is at ${stock}%. Weekends are this gym's busiest days, and it ran low before the Monday visit 3 of the last 4 weeks.`
          : `Stock is at ${stock}%. Restocking right before the busiest days avoids empty slots mid-week.`,
      // ~8% more sales from fewer empty slots, at an average margin of €1.60, minus 4 extra visits a month.
      impactPerMonth: round2(Math.max(0, dailyUnits * 0.08 * 30 * 1.6 - 4 * 25)),
      confidence: "high",
    });
  }
  return out;
}
