// Owner and investor insights computed on the client from a machine's sales and stock:
// the monthly statement, weekly profit and the agent's suggestions to the owner.
// Pure functions, so they work the same on mock data and on the real API's data.

import type { AgentSuggestion, InvestorStatement, Machine, ProfitWeek, SalesPoint, Slot } from "@/types";
import { addDays, getSimNow, hoursUntil } from "@/lib/format";

// ─── Cost model ──────────────────────────────────────────────────────────────

/** Goods as a share of sales, when the product cost isn't known per sale. */
const COGS_SHARE = 0.38;
const CARD_FEES = 0.018;
const RENT = 90;
const SERVICING = 110;
const TELEMETRY = 15;
const FIXED_PER_DAY = (RENT + SERVICING + TELEMETRY) / 30;
/** Average margin per unit, used for suggestion estimates when prices aren't known. */
const AVG_MARGIN = 1.6;

/** "20% of sales", "fixed €120 a month": an investor's payout terms in words. */
export const payoutTerms = (i: { payoutModel: "A" | "B" | "C"; payoutValue: number }) =>
  i.payoutModel === "A"
    ? `fixed €${i.payoutValue} a month`
    : `${Math.round(i.payoutValue * 100)}% of ${i.payoutModel === "B" ? "sales" : "net profit"}`;

/** Payout terms: A fixed monthly fee, B share of sales, C share of net profit. */
export const PAYOUT_TERMS = { A: 220, B: 0.15, C: 0.5 } as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The last full month before the simulated today, e.g. "2026-09". */
export function statementMonth(now: Date = getSimNow()): string {
  const d = new Date(now);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}

// ─── Statement ───────────────────────────────────────────────────────────────

export function statementFromSales(
  machineId: string,
  sales: SalesPoint[],
  model: "A" | "B" | "C",
  month = statementMonth(),
  /** The investor's own terms (A: € a month, B/C: share 0–1); defaults to PAYOUT_TERMS. */
  value?: number,
): InvestorStatement {
  const gross = round2(sales.filter((d) => d.date.startsWith(month)).reduce((s, d) => s + d.revenue, 0));
  const cogs = round2(gross * COGS_SHARE);
  const cardFees = round2(gross * CARD_FEES);
  const costs = round2(cogs + RENT + SERVICING + cardFees + TELEMETRY);
  const net = round2(gross - costs);
  const v = value ?? PAYOUT_TERMS[model];
  const payout = round2(model === "A" ? v : model === "B" ? gross * v : Math.max(0, net * v));
  return {
    machineId,
    month,
    sales: gross,
    costs,
    payoutModel: model,
    payout,
    lines: [
      { label: "Gross sales", amount: gross },
      { label: "Cost of goods", amount: -cogs },
      { label: "Location rent", amount: -RENT },
      { label: "Restocking and servicing", amount: -SERVICING },
      { label: "Card payment fees (1.8%)", amount: -cardFees },
      { label: "Telemetry and software", amount: -TELEMETRY },
      { label: "Net profit", amount: net },
    ],
  };
}

// ─── Weekly profit ───────────────────────────────────────────────────────────

const mondayOf = (day: string) => {
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(day, dow === 0 ? -6 : 1 - dow);
};

/** Up to the last 8 weeks, oldest first; the current week is partial. */
export function profitWeeksFromSales(sales: SalesPoint[]): ProfitWeek[] {
  const byWeek = new Map<string, { revenue: number; days: number }>();
  for (const d of sales) {
    const w = mondayOf(d.date);
    const cur = byWeek.get(w) ?? { revenue: 0, days: 0 };
    byWeek.set(w, { revenue: cur.revenue + d.revenue, days: cur.days + 1 });
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([, v], i, all) => v.days >= 4 || i === all.length - 1) // skip a stub week at the start
    .slice(-8)
    .map(([weekStart, v]) => {
      const costs = v.revenue * (COGS_SHARE + CARD_FEES) + FIXED_PER_DAY * v.days;
      return { weekStart, revenue: round2(v.revenue), costs: round2(costs), profit: round2(v.revenue - costs) };
    });
}

// ─── Suggestions ─────────────────────────────────────────────────────────────

/**
 * Rule-based suggestions to a machine's owner, from its live state. Stand-ins for what
 * the agent (Viktor) will suggest; the same shape, so the page doesn't change later.
 */
export function suggestionsFrom({
  machine,
  slots,
  sales,
}: {
  machine: Machine;
  slots: Slot[];
  sales: SalesPoint[];
}): AgentSuggestion[] {
  const recent = sales.slice(-28);
  const dailyUnits = recent.length ? recent.reduce((s, d) => s + d.units, 0) / recent.length : 0;
  const perSlot = slots.length ? dailyUnits / slots.length : 0;
  const avgPrice = recent.reduce((s, d) => s + d.units, 0)
    ? recent.reduce((s, d) => s + d.revenue, 0) / recent.reduce((s, d) => s + d.units, 0)
    : 2.2;
  const out: AgentSuggestion[] = [];
  // The id names what the suggestion is about, so a stored decision stays with it
  // even when other suggestions appear or disappear as the machine's state changes.
  const add = (subject: string, s: Omit<AgentSuggestion, "id" | "machineId" | "status">) =>
    out.push({ ...s, id: `${machine.id}-${s.kind}-${subject}`, machineId: machine.id, status: "open" });

  // Repairs first: lost sales cost the most.
  if (machine.status === "offline") {
    const alert = machine.alerts.find((a) => a.severity === "critical");
    add("offline", {
      kind: "service",
      title: "Book a technician for the card reader",
      reason: `${alert ? `${alert.title}. ` : ""}Card sales are lost while it is down; cash may still work.`,
      impactPerMonth: round2(dailyUnits * avgPrice * 30 * 0.25),
      confidence: "high",
    });
  } else {
    const stalled = machine.alerts.find((a) => a.severity === "critical");
    if (stalled) {
      add("stalled", {
        kind: "service",
        title: "Send someone to check the machine today",
        reason: `${stalled.title}.${stalled.likelyCause ? ` Likely cause: ${stalled.likelyCause}.` : ""}`,
        impactPerMonth: round2(dailyUnits * avgPrice * 30 * 0.3),
        confidence: "medium",
      });
    }
  }

  // A product that sells out: raise its price a little.
  const soldOut = slots.find((s) => s.quantity === 0);
  if (soldOut) {
    const p = soldOut.product;
    const sameSlots = slots.filter((s) => s.product.id === p.id).length;
    add(soldOut.product.id, {
      kind: "price",
      title: p.price > 0 ? `Raise ${p.name} from €${p.price.toFixed(2)} to €${(p.price + 0.2).toFixed(2)}` : `Raise ${p.name} by €0.20`,
      reason: "It sold out before the last visit, so demand is higher than the shelf. A small rise keeps most buyers and pays for an extra restock.",
      impactPerMonth: round2(perSlot * sameSlots * 1.6 * 0.2 * 30 * 0.9),
      confidence: "medium",
    });
  }

  // Fresh food that expires: give the slot to the best seller.
  const isFresh = (s: Slot) => (s.product.shelfLifeDays > 0 ? s.product.shelfLifeDays <= 3 : /sandwich|salad|wrap|banitsa|yogurt/i.test(s.product.name));
  const expiring = slots.find(
    (s) => isFresh(s) && s.quantity > 0 && hoursUntil(s.expiryDate) < 48,
  );
  // Only a slow seller is worth swapping: food that's about to expire, or a fresh slot
  // that's still mostly full. A fresh slot that sold out is selling, not a candidate.
  const slowFresh = slots.find((s) => isFresh(s) && s.capacity > 0 && s.quantity / s.capacity >= 0.6);
  const fresh = expiring ?? slowFresh;
  // The fastest seller: the packaged product with the least left (but not the slot itself).
  const best = slots
    .filter((s) => !isFresh(s) && s.capacity > 0)
    .sort((a, b) => a.quantity / a.capacity - b.quantity / b.capacity)[0];
  if (fresh && best && fresh.product.id !== best.product.id) {
    const margin = best.product.price > 0 ? best.product.price - best.product.cost : AVG_MARGIN;
    add(fresh.id, {
      kind: "swap",
      title: `Swap ${fresh.product.name} (${fresh.id.split("-").pop()}) for another ${best.product.name} slot`,
      reason: expiring
        ? `${expiring.quantity} are about to expire unsold. ${best.product.name} sells out fastest here and lasts months.`
        : `${fresh?.product.name} sells slowly here (still mostly full); ${best.product.name} sells out fastest and never goes off.`,
      impactPerMonth: round2(perSlot * 30 * margin * 0.8 + fresh.capacity * 0.3 * (fresh.product.cost || 1.5) * 4),
      confidence: expiring ? "high" : "medium",
    });
  }

  // Restock rhythm.
  if (machine.stockPercent < 40) {
    add("visits", {
      kind: "restock",
      title: machine.locationType === "gym" ? "Add a Friday evening visit" : "Visit right before the busiest days",
      reason:
        machine.locationType === "gym"
          ? `Stock is at ${machine.stockPercent}%. Weekends are this gym's busiest days, and it runs low before the Monday visit.`
          : `Stock is at ${machine.stockPercent}%. Restocking right before the busiest days avoids empty slots mid-week.`,
      // ~8% more sales from fewer empty slots, at an average margin, minus 4 extra visits a month.
      impactPerMonth: round2(Math.max(0, dailyUnits * 0.08 * 30 * AVG_MARGIN - 4 * 25)),
      confidence: "high",
    });
  }
  return out;
}
