// Seed the demo world — task A2 (Todor): 20 machines in Sofia, ~30 products,
// slot layouts, 2–3 suppliers. Sales history comes from the generator (A3).
// Run with `npm run db:seed`. Use a fixed random seed so every run gives the same data.

import "dotenv/config";
import { db } from "../src/lib/db";

async function main() {
  // TODO(A2): replace this starter data with the full fleet.
  await db.supplier.upsert({
    where: { id: "sup-drinks" },
    update: {},
    create: {
      id: "sup-drinks",
      name: "Sofia Beverages Ltd",
      email: process.env.SUPPLIER_DEMO_EMAIL ?? "orders@example.com",
      minOrderValue: 80,
      leadTimeDays: 1,
    },
  });
  console.log("Seeded starter data. TODO(A2): add the full fleet.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
