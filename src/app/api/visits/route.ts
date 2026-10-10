// GET /api/visits?date=YYYY-MM-DD — the stocker's route for a day, in order (A6).
// Without a date: the next day that has visits planned.
// POST /api/visits — the agent's notify_stocker saves tomorrow's route first. Body:
//   { route: [machine_id…], load_lists: [{ machine_id, items: [{ product, quantity }] }], date? }
import type { NextRequest } from "next/server";
import { z } from "zod";
import { listVisits } from "@/lib/data/fleet";
import { badRequest, loadCatalog, parseBody } from "@/lib/data/agent-api";
import { planVisits } from "@/lib/data/visits";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") ?? undefined;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  return Response.json(await listVisits(date));
}

const PlanBody = z.object({
  route: z.array(z.string().trim().min(1)).min(1).max(20),
  load_lists: z
    .array(
      z.object({
        machine_id: z.string().trim().min(1),
        items: z.array(z.object({ product: z.string().trim().min(1).max(100), quantity: z.number().int().min(1).max(200) })).max(40),
      }),
    )
    .max(20),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD").optional(),
});

export async function POST(req: Request) {
  const body = await parseBody(req, PlanBody);
  if ("error" in body) return body.error;
  if (new Set(body.data.route).size !== body.data.route.length) return badRequest("route lists a machine twice");
  const result = await planVisits(body.data, await loadCatalog());
  if ("error" in result) return badRequest(result.error!);
  return Response.json(result, { status: 201 });
}
