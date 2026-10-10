// The operator dashboard: everything here (orders, approvals, the agent run) needs an
// operator session, checked up front; the account bar streams in separately
// behind its own Suspense boundary since it never redirects.

import { Suspense } from "react";
import { LogOut } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getCurrentOperator, requireOperator } from "@/lib/auth";
import { logout } from "../login/actions";

// requireOperator can redirect() — that has to happen outside any <Suspense>
// boundary, or Next's Cache Components "instant navigation" validation
// errors out for a signed-out visitor instead of just redirecting them.
// The sign-in check reads the session cookie before rendering, so this route blocks on
// the server instead of serving a prerendered shell (lets the production build accept it).
export const instant = false;

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  await requireOperator("/");
  return (
    <AppShell
      account={
        <Suspense fallback={null}>
          <OperatorBar />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}

async function OperatorBar() {
  const operator = await getCurrentOperator();
  if (!operator) return null;
  return (
    <form action={logout} className="flex items-center gap-2 text-sm">
      <span className="hidden text-muted-foreground lg:inline">{operator.name}</span>
      <button
        type="submit"
        className="inline-flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 font-semibold hover:border-primary hover:text-primary"
      >
        <LogOut className="size-3.5" /> Sign out
      </button>
    </form>
  );
}
