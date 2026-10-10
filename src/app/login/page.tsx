import type { Metadata } from "next";
import { Suspense } from "react";
import { Landmark } from "lucide-react";
import { LoginForm } from "./login-form";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Sign in · VendAI" };

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_20%_10%,var(--accent),transparent_45%)] px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-sidebar text-sidebar-primary">
            <Landmark className="size-7" />
          </span>
          <h1 className="text-3xl font-bold tracking-tight">
            Sign in to Vend<span className="text-primary">AI</span>
          </h1>
          <p className="mt-2 text-lg text-muted-foreground">Investors see their own machines; operators run the fleet.</p>
        </div>
        <div className="rounded-2xl border bg-card p-7 shadow-sm">
          {/* The form reads ?next= from the URL, so it renders at request time. */}
          <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
            <LoginForm />
          </Suspense>
        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Demo accounts are listed in <code>docs/DEMO-ACCOUNTS.md</code>.
        </p>
      </div>
    </main>
  );
}
