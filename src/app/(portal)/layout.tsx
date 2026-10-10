// The investor portal: its own header instead of the operator sidebar. Who's signed in
// is read from the session cookie, so that part streams in behind a Suspense boundary.

import Link from "next/link";
import { Suspense } from "react";
import { LogOut } from "lucide-react";
import { getCurrentInvestor } from "@/lib/auth";
import { logout } from "../login/actions";

export default function PortalLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-sidebar text-sidebar-foreground print:hidden">
        <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center justify-between gap-4 px-6">
          <Link href="/owner" className="flex items-center gap-3">
            <span className="text-2xl font-bold tracking-tight text-white">
              Vend<span className="text-sidebar-primary">AI</span>
            </span>
            <span className="rounded-full bg-white/10 px-3 py-0.5 text-sm font-semibold text-white/80">Investor portal</span>
          </Link>
          <Suspense fallback={null}>
            <SignedIn />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-8">{children}</main>
    </div>
  );
}

async function SignedIn() {
  const investor = await getCurrentInvestor();
  if (!investor) return null;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="hidden text-white/80 sm:inline">
        Signed in as <b className="text-white">{investor.name}</b>
      </span>
      <form action={logout}>
        <button
          type="submit"
          className="inline-flex h-9 items-center gap-2 rounded-lg px-3 font-semibold text-white/85 hover:bg-white/10 hover:text-white"
        >
          <LogOut className="size-4" /> Sign out
        </button>
      </form>
    </div>
  );
}
