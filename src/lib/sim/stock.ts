// In-memory stock for simulation runs: batches per slot, oldest sold first,
// expired items unsellable until the stocker pulls them (that's the waste).
// The seed replays 60 days with this, and fast-forward (A7) and the benchmark
// (A8) can reuse it. The database copy of the result is the StockLevel table.

export interface Batch {
  quantity: number;
  expiresAt: Date;
  loadedAt: Date;
}

export type SlotStock = Map<string, Batch[]>; // slotId → batches, oldest first

/** Units that can still be sold at `at` (unexpired). */
export function sellable(batches: Batch[], at: Date): number {
  return batches.reduce((n, b) => (b.expiresAt > at ? n + b.quantity : n), 0);
}

/** Try to sell one unit at `at`. Returns false when the slot is effectively empty. */
export function consumeOne(batches: Batch[], at: Date): boolean {
  const batch = batches.find((b) => b.quantity > 0 && b.expiresAt > at);
  if (!batch) return false;
  batch.quantity--;
  return true;
}

/**
 * A stocker visit: pull expired items, then add `quantity` fresh units (capped
 * at capacity). Returns what was thrown away and what was actually loaded.
 */
export function restock(
  batches: Batch[],
  opts: { at: Date; capacity: number; shelfLifeDays: number; quantity?: number },
): { wasted: number; loaded: number } {
  let wasted = 0;
  for (let i = batches.length - 1; i >= 0; i--) {
    if (batches[i].expiresAt <= opts.at) {
      wasted += batches[i].quantity;
      batches.splice(i, 1);
    } else if (batches[i].quantity === 0) {
      batches.splice(i, 1);
    }
  }
  const onHand = batches.reduce((n, b) => n + b.quantity, 0);
  const room = opts.capacity - onHand;
  const loaded = Math.max(0, Math.min(room, opts.quantity ?? room));
  if (loaded > 0) {
    const expiresAt = new Date(opts.at.getTime() + opts.shelfLifeDays * 86400000);
    batches.push({ quantity: loaded, expiresAt, loadedAt: opts.at });
  }
  return { wasted, loaded };
}
