"use client";

// A vending machine drawn in the browser: every slot behind the glass with its products
// and how many are left. Owners and investors see their own machine the way it looks on
// site. Click a slot, or type its code on the keypad, to read it on the display.

import { useState } from "react";
import { Clock, WifiOff } from "lucide-react";
import type { Slot } from "@/types";
import { DEMO_NOW, formatDate, formatEUR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { stockColor, stockLevel } from "@/components/status";

// ─── Products as little drawings ─────────────────────────────────────────────

type Kind = "bottle" | "can" | "bar" | "bag" | "fresh";

/** What a product looks like on the shelf, guessed from its id and name. */
function kindOf(slot: Slot): Kind {
  const s = `${slot.product.id} ${slot.product.name}`.toLowerCase();
  if (/sandwich|wrap|salad|banitsa|yogurt|fruit/.test(s)) return "fresh";
  if (/chips|crackers|biscuit|nut|croissant|pringles/.test(s)) return "bag";
  if (/bar|choc|wafer|snickers|twix|kitkat|rice cake/.test(s)) return "bar";
  if (/red ?bull|monster|cola|fanta|coffee|brew|latte|energy/.test(s)) return "can";
  return "bottle";
}

/** A stable colour per product, so the same product looks the same in every slot. */
function colorOf(slot: Slot): string {
  const s = `${slot.product.id} ${slot.product.name}`.toLowerCase();
  if (/sparkling/.test(s)) return "#5fb6d9";
  if (/water/.test(s)) return "#3b9fe0";
  if (/zero/.test(s)) return "#26272b";
  if (/cola/.test(s)) return "#d7262e";
  if (/fanta|orange/.test(s)) return "#f28c18";
  if (/ice ?tea|peach/.test(s)) return "#e7a64a";
  if (/isotonic/.test(s)) return "#2fb5a7";
  if (/red ?bull/.test(s)) return "#2b4f9e";
  if (/monster/.test(s)) return "#3f9c35";
  if (/coffee|brew|latte/.test(s)) return "#7a4b2a";
  if (/protein/.test(s)) return "#8b5cf6";
  if (/granola|oat/.test(s)) return "#c7932f";
  if (/choc|wafer|hazelnut/.test(s)) return "#6b3a22";
  if (/chips|paprika/.test(s)) return /paprika/.test(s) ? "#e0532b" : "#f1c232";
  if (/nut/.test(s)) return "#a5672f";
  if (/crackers|biscuit|croissant/.test(s)) return "#d9a441";
  if (/rice/.test(s)) return "#8a5a3b";
  if (/yogurt|fruit/.test(s)) return "#e86fa4";
  return "#9aa5ad";
}

function Glyph({ kind, color, className }: { kind: Kind; color: string; className?: string }) {
  const common = { className, "aria-hidden": true as const };
  switch (kind) {
    case "bottle":
      return (
        <svg viewBox="0 0 16 40" {...common}>
          <rect x="6" y="0" width="4" height="4" rx="1" fill="#e9eef1" />
          <path d="M5 4h6l1 5c1.5 1 2 2 2 4v24a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V13c0-2 .5-3 2-4z" fill={color} opacity=".85" />
          <rect x="2" y="18" width="12" height="9" fill="#fff" opacity=".85" />
          <rect x="4" y="6" width="2" height="30" rx="1" fill="#fff" opacity=".35" />
        </svg>
      );
    case "can":
      return (
        <svg viewBox="0 0 16 30" {...common}>
          <rect x="1" y="1" width="14" height="28" rx="3" fill={color} />
          <rect x="1" y="1" width="14" height="3" rx="1.5" fill="#d5dbe0" />
          <rect x="1" y="26" width="14" height="3" rx="1.5" fill="#aeb7be" />
          <rect x="3" y="7" width="2" height="16" rx="1" fill="#fff" opacity=".4" />
          <rect x="6" y="11" width="7" height="6" rx="1" fill="#fff" opacity=".8" />
        </svg>
      );
    case "bar":
      return (
        <svg viewBox="0 0 40 16" {...common}>
          <path d="M3 2h34l2 2-2 2 2 2-2 2 2 2-2 2H3l-2-2 2-2-2-2 2-2-2-2z" fill={color} />
          <rect x="10" y="5" width="20" height="6" rx="1" fill="#fff" opacity=".8" />
        </svg>
      );
    case "bag":
      return (
        <svg viewBox="0 0 28 34" {...common}>
          <path d="M3 2h22l-1 3c2 3 2 21 0 24l1 3H3l1-3c-2-3-2-21 0-24z" fill={color} />
          <ellipse cx="14" cy="17" rx="7" ry="6" fill="#fff" opacity=".8" />
        </svg>
      );
    case "fresh":
      return (
        <svg viewBox="0 0 34 26" {...common}>
          <path d="M2 24 17 2l15 22z" fill="#f6efe2" stroke="#cbbfa8" strokeWidth="1.5" />
          <path d="M8 18h18" stroke={color} strokeWidth="4" strokeLinecap="round" />
          <path d="M11 13h12" stroke="#7cb342" strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
  }
}

// ─── The machine ─────────────────────────────────────────────────────────────

const codeOf = (slot: Slot) => slot.id.split("-").pop() ?? slot.id;
const monthYear = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "Europe/Sofia" });
/** "best before Sat 12 Oct" when close, "best before Sept 2027" when far. */
function bestBefore(slot: Slot): string | null {
  if (!slot.expiryDate || slot.quantity === 0) return null;
  const days = hoursLeft(slot) / 24;
  return `best before ${days <= 60 ? formatDate(slot.expiryDate) : monthYear.format(new Date(slot.expiryDate))}`;
}
const hoursLeft = (slot: Slot) => (slot.expiryDate ? (new Date(slot.expiryDate).getTime() - DEMO_NOW.getTime()) / 3_600_000 : Infinity);

export function VendingMachine({
  slots,
  name,
  offline,
  className,
}: {
  slots: Slot[];
  name: string;
  offline?: boolean;
  className?: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const selected = slots.find((s) => s.id === selectedId) ?? null;

  const rows = [...new Set(slots.map((s) => codeOf(s)[0]))].sort();
  const cols = Math.max(...rows.map((r) => slots.filter((s) => codeOf(s)[0] === r).length), 1);
  const units = slots.reduce((n, s) => n + s.quantity, 0);
  const capacity = slots.reduce((n, s) => n + s.capacity, 0);
  const percent = capacity ? Math.round((units / capacity) * 100) : 0;
  const soldOut = slots.filter((s) => s.quantity === 0).length;

  const press = (key: string) => {
    if (key === "CLEAR") {
      setTyped("");
      setSelectedId(null);
      return;
    }
    const next = /[A-Z]/.test(key) ? key : typed.length === 1 ? typed + key : "";
    setTyped(next);
    if (next.length === 2) {
      const slot = slots.find((s) => codeOf(s) === next);
      setSelectedId(slot?.id ?? null);
    }
  };

  const display = selected
    ? [
        `${codeOf(selected)} · ${selected.product.name}`,
        selected.quantity === 0 ? "SOLD OUT" : `${selected.quantity} of ${selected.capacity} left`,
        [selected.product.price > 0 ? formatEUR(selected.product.price) : null, bestBefore(selected)]
          .filter(Boolean)
          .join(" · "),
      ]
    : typed
      ? [`Slot ${typed}_`, "Type a number", ""]
      : [name, `${units} items · ${percent}% full`, soldOut ? `${soldOut} slot${soldOut > 1 ? "s" : ""} sold out` : "Nothing sold out"];

  return (
    <div className={cn("flex flex-col gap-6 lg:flex-row lg:items-stretch", className)}>
      {/* Cabinet */}
      <div className="relative flex-1 rounded-[28px] bg-gradient-to-b from-[#24323c] to-[#16212a] p-4 shadow-[0_20px_50px_-20px_rgb(0_0_0/0.6)] ring-1 ring-black/40 sm:p-5">
        <div className="mb-3 flex items-center justify-between px-2">
          <span className="text-lg font-black tracking-tight text-white">
            Vend<span className="text-[#3fc1c9]">AI</span>
          </span>
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-white/80">
            {offline ? (
              <>
                <WifiOff className="size-4 text-red-400" /> Offline
              </>
            ) : (
              <>
                <span className="size-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400" /> Online
              </>
            )}
          </span>
        </div>

        {/* Glass with the shelves */}
        <div className="relative overflow-hidden rounded-2xl border-4 border-[#0e161c] bg-gradient-to-br from-[#e9f3f6] via-[#d7e8ee] to-[#c3d9e1]">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_35%,rgb(255_255_255/0.45)_45%,transparent_55%)]" aria-hidden />
          <div className="space-y-0">
            {rows.map((row) => (
              <div key={row} className="border-b-[6px] border-[#9fb3bd] px-2 pt-3 last:border-b-0 sm:px-3">
                <div className="grid gap-2 sm:gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                  {slots
                    .filter((s) => codeOf(s)[0] === row)
                    .sort((a, b) => codeOf(a).localeCompare(codeOf(b), undefined, { numeric: true }))
                    .map((slot) => (
                      <SlotCell
                        key={slot.id}
                        slot={slot}
                        selected={slot.id === selectedId}
                        onSelect={() => {
                          setSelectedId(slot.id === selectedId ? null : slot.id);
                          setTyped("");
                        }}
                      />
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pickup flap */}
        <div className="mx-auto mt-4 h-12 w-3/5 rounded-xl border-4 border-[#0e161c] bg-[#0b1217] shadow-inner">
          <div className="mx-auto mt-1.5 h-1.5 w-1/2 rounded-full bg-white/10" />
        </div>
      </div>

      {/* Control panel */}
      <div className="flex w-full flex-col gap-4 rounded-[28px] bg-gradient-to-b from-[#24323c] to-[#16212a] p-5 ring-1 ring-black/40 lg:w-72">
        <div
          className="min-h-28 rounded-xl border-2 border-black/50 bg-[#0d2a24] px-4 py-3 font-mono text-[#7dffcf] shadow-inner"
          role="status"
          aria-live="polite"
        >
          {display.map((line, i) => (
            <p key={i} className={cn("leading-snug", i === 0 ? "text-base font-bold" : "text-sm", i === 1 && selected?.quantity === 0 && "text-red-300")}>
              {line || " "}
            </p>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-2" aria-label="Keypad: type a slot code">
          {[...rows, ...Array.from({ length: Math.max(0, 4 - rows.length) }, () => "")].slice(0, 4).map((r, i) => (
            <Key key={`r${i}`} label={r} onPress={r ? () => press(r) : undefined} />
          ))}
          {Array.from({ length: Math.min(cols, 8) }, (_, i) => String(i + 1)).map((n) => (
            <Key key={n} label={n} onPress={() => press(n)} />
          ))}
          <Key label="Clear" onPress={() => press("CLEAR")} wide />
        </div>

        <div className="mt-auto space-y-2 text-sm text-white/75">
          <div className="flex items-center justify-between">
            <span>Filled</span>
            <span className="font-bold tabular-nums" style={{ color: stockColor[stockLevel(percent)] }}>
              {percent}%
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full" style={{ width: `${percent}%`, background: stockColor[stockLevel(percent)] }} />
          </div>
          <div className="mx-auto mt-3 h-10 w-3 rounded-full bg-black/60 ring-1 ring-white/10" title="Coin slot" aria-hidden />
        </div>
      </div>
    </div>
  );
}

function Key({ label, onPress, wide }: { label: string; onPress?: () => void; wide?: boolean }) {
  if (!label) return <span />;
  return (
    <button
      type="button"
      onClick={onPress}
      className={cn(
        "h-10 rounded-lg bg-gradient-to-b from-[#e8edf0] to-[#b9c4ca] text-base font-bold text-[#1b252c] shadow-[0_2px_0_#6f7d85] transition active:translate-y-0.5 active:shadow-none",
        wide && "col-span-4",
      )}
    >
      {label}
    </button>
  );
}

function SlotCell({ slot, selected, onSelect }: { slot: Slot; selected: boolean; onSelect: () => void }) {
  const kind = kindOf(slot);
  const color = colorOf(slot);
  const pct = slot.capacity ? Math.round((slot.quantity / slot.capacity) * 100) : 0;
  const level = stockLevel(pct);
  const expiring = slot.quantity > 0 && hoursLeft(slot) <= 48;
  // Draw up to 6 items at the front; the number tells the rest.
  const drawn = Math.min(slot.quantity, 6);
  const glyphSize = { bottle: "h-10 w-4", can: "h-8 w-4", bar: "h-4 w-9", bag: "h-7 w-6", fresh: "h-5 w-7" }[kind];
  // Flat items (bars, sandwiches) sit in a small grid; tall ones stand in a row.
  const grid = kind === "bar" ? "grid grid-cols-2 place-items-center gap-x-1 gap-y-0.5" : kind === "fresh" ? "grid grid-cols-3 place-items-center gap-0.5" : "";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${codeOf(slot)} ${slot.product.name}: ${slot.quantity} of ${slot.capacity}`}
      className={cn(
        "group relative flex min-w-0 flex-col items-stretch rounded-lg bg-white/40 p-1.5 text-left transition hover:bg-white/70 focus-visible:outline-3 focus-visible:outline-[#3fc1c9]",
        selected && "bg-white/80 ring-3 ring-[#3fc1c9]",
      )}
    >
      {/* Products on the spiral */}
      <div className={cn("relative flex h-14 items-end justify-center gap-0.5 overflow-hidden", grid && `${grid} content-end`)}>
        {drawn === 0 ? (
          <span className="mb-3 -rotate-6 rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-black tracking-wider text-white shadow">SOLD OUT</span>
        ) : (
          Array.from({ length: drawn }, (_, i) => (
            <Glyph key={i} kind={kind} color={color} className={cn(glyphSize, "shrink-0 drop-shadow-sm")} />
          ))
        )}
        {expiring && (
          <span className="absolute top-0 right-0 z-10 grid size-5 place-items-center rounded-full bg-amber-400 text-[#3a2a00] shadow" title="Expires within 48 h">
            <Clock className="size-3" />
          </span>
        )}
      </div>
      {/* Spiral and price rail */}
      <div className="mt-1 h-1.5 rounded-full bg-[repeating-linear-gradient(90deg,#8e9ea7_0_3px,transparent_3px_7px)]" aria-hidden />
      <div className="mt-1.5 flex items-center justify-between gap-1 rounded bg-[#1b252c] px-1.5 py-0.5 text-white">
        <span className="font-mono text-xs font-bold">{codeOf(slot)}</span>
        <span className="text-xs font-bold tabular-nums" style={{ color: slot.quantity === 0 ? "#ff8a8a" : level === "ok" ? "#8ff0b4" : level === "warn" ? "#ffd27a" : "#ff8a8a" }}>
          {slot.quantity}/{slot.capacity}
        </span>
      </div>
      <span className="mt-1 truncate text-xs font-medium text-[#22313a]" title={slot.product.name}>
        {slot.product.name}
      </span>
    </button>
  );
}
