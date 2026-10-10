// GET /api/investors/:id/statement?month=2026-10 — one machine's month-to-date
// statement and payout under the investor's model (A6, for C7).
import type { NextRequest } from "next/server";
import { investorStatement } from "@/lib/data/fleet";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/investors/[id]/statement">) {
  const { id } = await ctx.params;
  const month = req.nextUrl.searchParams.get("month") ?? undefined;
  if (month && !/^\d{4}-\d{2}$/.test(month)) {
    return Response.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }
  const statement = await investorStatement(id, month);
  if (!statement) return Response.json({ error: "Investor not found" }, { status: 404 });
  return Response.json(statement);
}
