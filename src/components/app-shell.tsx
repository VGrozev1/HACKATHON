"use client";

// C1: app shell. Collapsible left sidebar, demo-mode badge and the simulated date.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import {
  CalendarDays,
  ClipboardList,
  FastForward,
  Landmark,
  LayoutGrid,
  MoonStar,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DEMO_NOW, formatDate } from "@/lib/format";
import { USE_MOCK } from "@/lib/api";

const NAV = [
  { href: "/", label: "Fleet", icon: LayoutGrid, match: (p: string) => p === "/" || p.startsWith("/machines") },
  { href: "/run-night", label: "Run night", icon: MoonStar, match: (p: string) => p.startsWith("/run-night") },
  { href: "/orders", label: "Orders", icon: ClipboardList, match: (p: string) => p.startsWith("/orders") },
  { href: "/simulation", label: "Simulation", icon: FastForward, match: (p: string) => p.startsWith("/simulation") },
  { href: "/investor", label: "Investor", icon: Landmark, match: (p: string) => p.startsWith("/investor") },
];

function ActiveNav({ collapsed }: { collapsed: boolean }) {
  return <NavLinks collapsed={collapsed} pathname={usePathname()} />;
}

function NavLinks({ collapsed, pathname }: { collapsed: boolean; pathname: string | null }) {
  return (
    <nav className="mt-2 flex flex-1 flex-col gap-1 px-3" aria-label="Main">
      {NAV.map(({ href, label, icon: Icon, match }) => {
        const active = pathname !== null && match(pathname);
        return (
          <Link
            key={href}
            href={href}
            title={collapsed ? label : undefined}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex h-12 items-center gap-3 rounded-xl px-3 text-base font-medium transition-colors",
              collapsed && "justify-center px-0",
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white",
            )}
          >
            <Icon className="size-5 shrink-0" aria-hidden />
            {!collapsed && label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen">
      <aside
        className={cn(
          "sticky top-0 flex h-screen shrink-0 flex-col bg-sidebar print:hidden text-sidebar-foreground transition-[width] duration-200",
          collapsed ? "w-[76px]" : "w-64",
        )}
      >
        <div className={cn("flex h-20 items-center gap-3 px-5", collapsed && "justify-center px-0")}>
          <Logo />
          {!collapsed && (
            <span className="text-2xl font-bold tracking-tight text-white">
              Vend<span className="text-sidebar-primary">AI</span>
            </span>
          )}
        </div>

        {/* The pathname is only known at request time, so the active highlight streams in. */}
        <Suspense fallback={<NavLinks collapsed={collapsed} pathname={null} />}>
          <ActiveNav collapsed={collapsed} />
        </Suspense>

        <div className="p-3">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className={cn(
              "flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-white",
              collapsed && "justify-center px-0",
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
            {!collapsed && "Collapse"}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex print:hidden h-16 items-center justify-end gap-3 border-b bg-background/90 px-8 backdrop-blur">
          <span className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-sm font-semibold text-accent-foreground">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            Demo mode · {USE_MOCK ? "simulated data" : "live simulation"}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-sm font-semibold">
            <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
            {formatDate(DEMO_NOW)}
          </span>
        </header>
        <main className="mx-auto w-full max-w-[1680px] flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
        <rect x="5" y="2.5" width="14" height="19" rx="2.5" />
        <path d="M8.5 7h4M8.5 10.5h4M16 7v3.5M8.5 17.5h7" strokeLinecap="round" />
      </svg>
    </span>
  );
}
