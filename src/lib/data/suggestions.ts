// The agent's suggestions for the manager (GET/POST /api/suggestions, accept,
// reject). Never applied automatically: deciding one only changes its status
// and decidedAt. Nothing here touches prices, stock or orders.

import { db } from "@/lib/db";
import type { Suggestion as SuggestionDto } from "@/lib/api-types";
import type { SuggestionStatus, SuggestionType } from "@/generated/prisma/enums";
import { nextReadableId, type Catalog } from "./agent-api";
import { getSimToday } from "./sim-clock";

export const MAX_SUGGESTIONS_PER_NIGHT = 5;
export const MAX_PRICE_CHANGE_PERCENT = 15;

export interface SuggestionInput {
  type: SuggestionType;
  machine_id: string;
  product?: string;
  suggestion: string;
  reason: string;
  expected_effect: string;
  percent_change?: number;
  run_date?: string;
}

type Row = Awaited<ReturnType<typeof db.suggestion.findFirstOrThrow<{ include: { machine: true } }>>>;

export function toSuggestionDto(s: Row): SuggestionDto & { percentChange: number | null; createdAt: string; decidedAt: string | null } {
  return {
    id: s.id,
    runDate: s.runDate,
    type: s.type,
    machineId: s.machineId,
    machineName: s.machine.name,
    ...(s.product ? { product: s.product } : {}),
    suggestion: s.suggestion,
    reason: s.reason,
    expectedEffect: s.expectedEffect,
    status: s.status,
    percentChange: s.percentChange,
    createdAt: s.createdAt.toISOString(),
    decidedAt: s.decidedAt?.toISOString() ?? null,
  };
}

/** Create a pending suggestion, or say which rules it breaks (nothing is stored then). */
export async function createSuggestion(input: SuggestionInput, catalog: Catalog) {
  const runDate = input.run_date ?? (await getSimToday());
  const reasons: string[] = [];

  const machine = await db.machine.findUnique({ where: { id: input.machine_id }, include: { slots: true } });
  if (!machine) reasons.push(`Unknown machine id "${input.machine_id}".`);

  const product = input.product ? catalog.findProduct(input.product) : undefined;
  if (input.product && !product) reasons.push(`"${input.product}" is not a product we carry.`);

  if (input.type === "price_change") {
    if (!product) reasons.push("A price_change suggestion must name a product we carry.");
    else if (machine && !machine.slots.some((s) => s.productId === product.id)) {
      reasons.push(`${machine.name} doesn't sell ${product.name}.`);
    }
    if (input.percent_change === undefined) reasons.push("A price_change suggestion needs percent_change.");
    else if (Math.abs(input.percent_change) > MAX_PRICE_CHANGE_PERCENT) {
      reasons.push(`Price changes can be at most ±${MAX_PRICE_CHANGE_PERCENT}%, got ${input.percent_change}%.`);
    }
  }

  const tonight = await db.suggestion.count({ where: { runDate } });
  if (tonight >= MAX_SUGGESTIONS_PER_NIGHT) {
    reasons.push(`Already ${MAX_SUGGESTIONS_PER_NIGHT} suggestions for ${runDate}; not adding another.`);
  }
  if (reasons.length) return { rejected: reasons };

  const existing = await db.suggestion.findMany({ select: { id: true } });
  const row = await db.suggestion.create({
    data: {
      id: nextReadableId("SUG", existing.map((s) => s.id)),
      runDate,
      type: input.type,
      machineId: machine!.id,
      productId: product?.id ?? null,
      product: product?.name ?? null,
      suggestion: input.suggestion,
      reason: input.reason,
      expectedEffect: input.expected_effect,
      percentChange: input.type === "price_change" ? (input.percent_change ?? null) : null,
    },
    include: { machine: true },
  });
  return { created: toSuggestionDto(row) };
}

export async function listSuggestions(filter: { status?: SuggestionStatus; machineId?: string }) {
  const rows = await db.suggestion.findMany({
    where: { ...(filter.status ? { status: filter.status } : {}), ...(filter.machineId ? { machineId: filter.machineId } : {}) },
    include: { machine: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 200,
  });
  return rows.map(toSuggestionDto);
}

/** Accept or reject a pending suggestion. Only the status changes. */
export async function decideSuggestion(id: string, status: "accepted" | "rejected") {
  const row = await db.suggestion.findUnique({ where: { id }, include: { machine: true } });
  if (!row) return { notFound: true as const };
  if (row.status !== "pending") return { conflict: `Suggestion ${id} is already ${row.status}.` };
  const updated = await db.suggestion.update({
    where: { id },
    data: { status, decidedAt: new Date() },
    include: { machine: true },
  });
  return { suggestion: toSuggestionDto(updated) };
}
