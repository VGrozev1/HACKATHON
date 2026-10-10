// The operator dashboard: everything here (orders, approvals, the agent run) needs an
// operator session. The session is read from the request cookie, so the gate and the
// account bar stream in behind Suspense boundaries.

import { Suspense } from "react";
import { LogOut } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { GridSkeleton } from "@/components/states";
import { getCurrentOperator, requireOperator } from "@/lib/auth";
import { logout } from "../login/actions";

export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <AppShell
      account={
        <Suspense fallback={null}>
          <OperatorBar />
        </Suspense>
      }
    >
      <Suspense fallback={<GridSkeleton count={4} />}>
        <OperatorGate>{children}</OperatorGate>
      </Suspense>
    </AppShell>
  );
}

async function OperatorGate({ children }: { children: React.ReactNode }) {
  await requireOperator("/");
  return <>{children}</>;
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
