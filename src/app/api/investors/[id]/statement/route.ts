// GET /api/investors/:id/statement?month=2026-10 — investor view (C7). Stub: A6.
import type { NextRequest } from "next/server";
import { mockInvestorStatement } from "@/mocks";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/investors/[id]/statement">) {
  const { id } = await ctx.params;
  const month = req.nextUrl.searchParams.get("month") ?? undefined;
  return Response.json(mockInvestorStatement(id, month));
}
