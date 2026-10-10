"use client";

// Loads the backend's simulated today once per page load, so every screen's "now"
// (header date, expiry countdowns, forecast marker, statement month) follows fast-forward.

import { useEffect } from "react";
import { getSimToday } from "@/lib/api";
import { setSimToday } from "@/lib/format";

export function SimClock() {
  useEffect(() => {
    getSimToday().then(setSimToday, () => {});
  }, []);
  return null;
}
