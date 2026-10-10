// Copy catalog edits from src/lib/sim/fleet.ts (product names, costs, prices,
// shelf life; supplier details) into the database WITHOUT wiping anything,
// unlike `npm run db:seed`. Sales, stock, orders and agent runs stay as they are.
//
//   npm run db:sync-catalog -- --dry-run   # show what would change
//   npm run db:sync-catalog                # apply it

import "dotenv/config";
import { db } from "../src/lib/db";
import { PRODUCTS, SUPPLIERS } from "../src/lib/sim/fleet";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const [products, suppliers] = await Promise.all([db.product.findMany(), db.supplier.findMany()]);
  const productById = new Map(products.map((p) => [p.id, p]));
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));
  const updates: { label: string; run: () => Promise<unknown> }[] = [];

  for (const p of PRODUCTS) {
    const row = productById.get(p.id);
    if (!row) {
      console.log(`  skip ${p.id}: not in the database (new products need a reseed)`);
      continue;
    }
    const changes: string[] = [];
    if (row.name !== p.name) changes.push(`name "${row.name}" → "${p.name}"`);
    if (row.cost !== p.cost) changes.push(`cost €${row.cost} → €${p.cost}`);
    if (row.price !== p.price) changes.push(`price €${row.price} → €${p.price}`);
    if (row.shelfLifeDays !== p.shelfLifeDays) changes.push(`shelf life ${row.shelfLifeDays} → ${p.shelfLifeDays} days`);
    if (row.category !== p.category) changes.push(`category ${row.category} → ${p.category}`);
    if (row.supplierId !== p.supplierId) changes.push(`supplier ${row.supplierId} → ${p.supplierId}`);
    if (changes.length) {
      updates.push({
        label: `${p.id}: ${changes.join(", ")}`,
        run: () =>
          db.product.update({
            where: { id: p.id },
            data: { name: p.name, cost: p.cost, price: p.price, shelfLifeDays: p.shelfLifeDays, category: p.category, supplierId: p.supplierId },
          }),
      });
    }
  }

  for (const s of SUPPLIERS) {
    const row = supplierById.get(s.id);
    if (!row) continue;
    const changes: string[] = [];
    if (row.name !== s.name) changes.push(`name "${row.name}" → "${s.name}"`);
    if (row.minOrderValue !== s.minOrderValue) changes.push(`minimum order €${row.minOrderValue} → €${s.minOrderValue}`);
    if (row.leadTimeDays !== s.leadTimeDays) changes.push(`lead time ${row.leadTimeDays} → ${s.leadTimeDays} days`);
    if (changes.length) {
      updates.push({
        label: `${s.id}: ${changes.join(", ")}`,
        run: () => db.supplier.update({ where: { id: s.id }, data: { name: s.name, minOrderValue: s.minOrderValue, leadTimeDays: s.leadTimeDays } }),
      });
    }
  }

  if (!updates.length) {
    console.log("The database already matches fleet.ts.");
    return;
  }
  for (const u of updates) console.log(`  ${u.label}`);
  if (dryRun) {
    console.log(`${updates.length} change(s) shown; nothing written (--dry-run).`);
    return;
  }
  for (const u of updates) await u.run();
  console.log(`Applied ${updates.length} change(s). Past sales keep the price they sold at.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
