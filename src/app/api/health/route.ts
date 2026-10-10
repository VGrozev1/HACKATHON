// GET /api/health — is the app up, and can it reach the database?
import { db } from "@/lib/db";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, db: "up" });
  } catch {
    return Response.json({ ok: true, db: "down" }, { status: 503 });
  }
}
