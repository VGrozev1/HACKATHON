// POST /api/suggestions/:id/accept — the manager accepts a pending suggestion
// (dashboard, or the Telegram button sug_ok:<id>). ONLY the status changes:
// nothing here touches prices, stock or orders. 409 if it was already decided.
import type { NextRequest } from "next/server";
import { decideSuggestion } from "@/lib/data/suggestions";

export async function POST(_req: NextRequest, ctx: RouteContext<"/api/suggestions/[id]/accept">) {
  const { id } = await ctx.params;
  const result = await decideSuggestion(id, "accepted");
  if ("notFound" in result) return Response.json({ error: `Unknown suggestion id "${id}"` }, { status: 404 });
  if ("conflict" in result) return Response.json({ error: result.conflict }, { status: 409 });
  return Response.json(result.suggestion);
}
