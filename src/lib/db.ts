// The one Prisma client for the whole app. Import `db` from here; never create
// another PrismaClient (each one opens its own connection pool).

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForDb = globalThis as unknown as { db?: PrismaClient };

function createClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const db = globalForDb.db ?? createClient();

// Keep one client across hot reloads in dev.
if (process.env.NODE_ENV !== "production") globalForDb.db = db;
