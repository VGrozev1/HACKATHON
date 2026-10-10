// Helpers for the endpoints Viktor's agent calls (see api.md, "Agent API").
// Everything the agent sends is untrusted: parse it with zod, look ids up for
// real, and answer bad input with a 400 that says exactly what to fix.

import type { z } from "zod";
import { db } from "@/lib/db";

/** Agent bodies use snake_case (machine_id); also accept camelCase (machineId). */
export function snakeKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(snakeKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), snakeKeys(v)]),
    );
  }
  return value;
}

export function badRequest(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}

/** "lines.0.quantity: Expected number, received string; reason: Required" */
export function zodMessage(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
}

/** Parse a JSON request body (snake_case or camelCase) against a schema. */
export async function parseBody<T extends z.ZodType>(
  req: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { error: Response }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { error: badRequest("Body must be JSON") };
  }
  const parsed = schema.safeParse(snakeKeys(raw));
  if (!parsed.success) return { error: badRequest(zodMessage(parsed.error)) };
  return { data: parsed.data };
}

const norm = (s: string) => s.trim().toLowerCase();

/** The catalog, for resolving names the agent uses ("Devin water 0.5 l" or "water-500"). */
export async function loadCatalog() {
  const [suppliers, products] = await Promise.all([
    db.supplier.findMany({ orderBy: { name: "asc" } }),
    db.product.findMany({ include: { supplier: true }, orderBy: { name: "asc" } }),
  ]);
  return {
    suppliers,
    products,
    findSupplier: (nameOrId: string) => suppliers.find((s) => norm(s.id) === norm(nameOrId) || norm(s.name) === norm(nameOrId)),
    findProduct: (nameOrId: string) => products.find((p) => norm(p.id) === norm(nameOrId) || norm(p.name) === norm(nameOrId)),
  };
}

export type Catalog = Awaited<ReturnType<typeof loadCatalog>>;

/** Next readable id for a prefix, e.g. "PO-0007" after "PO-0006". */
export function nextReadableId(prefix: string, existing: string[]): string {
  const max = existing.reduce((m, id) => {
    const n = Number(id.slice(prefix.length + 1));
    return Number.isInteger(n) && n > m ? n : m;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

export async function machineExists(id: string): Promise<boolean> {
  return Boolean(await db.machine.findUnique({ where: { id }, select: { id: true } }));
}
