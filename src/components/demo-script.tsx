"use client";

// C9 helper: a floating "Demo script" panel with the click path for the judges,
// plus keyboard shortcuts 1–6 to jump between the screens during the live demo.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ListChecks, X } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { href: "/", label: "Fleet overview", hint: "20 machines, 4 low on stock, 1 offline" },
  { href: "/machines/SOF-GYM-01", label: "Gym Lozenets detail", hint: "Sold out of water; forecast +30%" },
  { href: "/run-night", label: "Run night", hint: "Press the big button; narrate the steps" },
  { href: "/orders", label: "Orders", hint: "Approve the €412 Balkan Snack Distribution order" },
  { href: "/simulation", label: "Simulation", hint: "Fast-forward a week: the one number" },
  { href: "/investor/SOF-GYM-01", label: "Investor view", hint: "Statement and payout A / B / C" },
];

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

export function DemoScript() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= STEPS.length) {
        e.preventDefault();
        router.push(STEPS[n - 1].href);
      } else if (e.key === "?") {
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <div className="fixed right-6 bottom-6 z-40 flex flex-col items-end gap-3 print:hidden">
      {open && (
        <div
          className="w-80 animate-in rounded-2xl border bg-card p-4 shadow-xl duration-200 fade-in slide-in-from-bottom-2"
          role="dialog"
          aria-label="Demo script"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">Demo script</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close demo script"
            >
              <X className="size-4" />
            </button>
          </div>
          <Suspense fallback={<StepList current={null} onPick={() => setOpen(false)} />}>
            <ActiveStepList onPick={() => setOpen(false)} />
          </Suspense>
          <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
            Press <Kbd>1</Kbd>–<Kbd>6</Kbd> to jump, <Kbd>?</Kbd> to toggle this panel.
          </p>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex h-12 items-center gap-2 rounded-full bg-foreground px-5 text-base font-semibold text-background shadow-lg transition-transform hover:scale-105"
      >
        <ListChecks className="size-5" /> Demo script
      </button>
    </div>
  );
}

function ActiveStepList({ onPick }: { onPick: () => void }) {
  return <StepList current={usePathname()} onPick={onPick} />;
}

function StepList({ current, onPick }: { current: string | null; onPick: () => void }) {
  return (
    <ol className="space-y-1">
      {STEPS.map((s, i) => {
        const active = current === s.href;
        return (
          <li key={s.href}>
            <Link
              href={s.href}
              onClick={onPick}
              className={cn(
                "flex items-start gap-3 rounded-xl px-2.5 py-2 transition-colors",
                active ? "bg-accent text-accent-foreground" : "hover:bg-muted",
              )}
            >
              <Kbd className={cn("mt-0.5", active && "border-primary bg-primary text-primary-foreground")}>{i + 1}</Kbd>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{s.label}</span>
                <span className="block text-xs text-muted-foreground">{s.hint}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-grid h-6 min-w-6 shrink-0 place-items-center rounded-md border bg-muted px-1.5 font-mono text-xs font-semibold",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
