import { redirect } from "next/navigation";
import { Suspense } from "react";
import { OwnerPortal } from "@/components/owner/owner-portal";
import { GridSkeleton } from "@/components/states";
import { requireInvestor } from "@/lib/auth";

// requireInvestor/redirect() have to run outside any <Suspense> boundary,
// or Next's Cache Components "instant navigation" validation errors out
// for a signed-out visitor (or one viewing someone else's machine) instead
// of just redirecting them.
// The sign-in check reads the session cookie before rendering, so this route blocks on
// the server instead of serving a prerendered shell (lets the production build accept it).
export const instant = false;

export default async function OwnerPage({ params }: PageProps<"/owner/[machineId]">) {
  const { machineId } = await params;
  const investor = await requireInvestor(`/owner/${machineId}`);
  if (!investor.machineIds.includes(machineId)) redirect("/owner");
  const { name, payoutModel, payoutValue, machineIds } = investor;
  return (
    <Suspense fallback={<GridSkeleton count={4} />}>
      <OwnerPortal machineId={machineId} investor={{ name, payoutModel, payoutValue, machineIds }} />
    </Suspense>
  );
}
