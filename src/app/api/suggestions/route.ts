// GET /api/suggestions?status=pending|accepted|rejected|all&machine_id= — newest first.
// POST /api/suggestions — the agent's create_suggestion. Body (snake or camel case):
//   { type, machine_id, product?, suggestion, reason, expected_effect, percent_change? }
// Rules: at most 5 a night, price changes within ±15% on a product the machine
// sells. Breaking a rule returns 422 with the reasons and stores nothing.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { loadCatalog, parseBody } from "@/lib/data/agent-api";
import { createSuggestion, listSuggestions } from "@/lib/data/suggestions";

const STATUSES = ["pending", "accepted", "rejected"] as const;

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status") ?? "all";
  if (status !== "all" && !STATUSES.includes(status as (typeof STATUSES)[number])) {
    return Response.json({ error: "status must be pending, accepted, rejected or all" }, { status: 400 });
  }
  const machineId = req.nextUrl.searchParams.get("machine_id") ?? undefined;
  return Response.json(
    await listSuggestions({ status: status === "all" ? undefined : (status as (typeof STATUSES)[number]), machineId }),
  );
}

const text = z.string().trim().min(1).max(300, "max 300 characters");
const SuggestionBody = z.object({
  type: z.enum(["extra_stock", "product_swap", "price_change", "visit_change"]),
  machine_id: z.string().trim().min(1).max(64),
  product: z.string().trim().min(1).max(100).optional(),
  suggestion: text,
  reason: text,
  expected_effect: text,
  percent_change: z.number().min(-100).max(100).optional(),
  run_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "run_date must be YYYY-MM-DD").optional(),
});

export async function POST(req: Request) {
  const body = await parseBody(req, SuggestionBody);
  if ("error" in body) return body.error;
  const result = await createSuggestion(body.data, await loadCatalog());
  if ("rejected" in result) {
    return Response.json({ error: result.rejected!.join(" "), status: "rejected", reasons: result.rejected }, { status: 422 });
  }
  return Response.json(result.created, { status: 201 });
}
