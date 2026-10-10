"use client";

import { useSyncExternalStore } from "react";
import { DEMO_NOW, getSimNow, subscribeSimNow } from "@/lib/format";

/** The simulated now (see src/lib/format.ts); re-renders when fast-forward moves it. */
export function useSimNow(): Date {
  return useSyncExternalStore(subscribeSimNow, getSimNow, () => DEMO_NOW);
}
