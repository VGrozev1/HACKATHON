import { redirect } from "next/navigation";
import { Suspense } from "react";
import { OwnerPortal } from "@/components/owner/owner-portal";
import { GridSkeleton } from "@/components/states";
import { requireInvestor } from "@/lib/auth";

export default function OwnerPage({ params }: PageProps<"/owner/[machineId]">) {
  return (
    <Suspense fallback={<GridSkeleton count={4} />}>
      <GuardedPortal params={params} />
    </Suspense>
  );
}

/** Signed-in investors only, and only for a machine they own. */
async function GuardedPortal({ params }: { params: Promise<{ machineId: string }> }) {
  const { machineId } = await params;
  const investor = await requireInvestor(`/owner/${machineId}`);
  if (!investor.machineIds.includes(machineId)) redirect("/owner");
  const { name, payoutModel, payoutValue, machineIds } = investor;
  return <OwnerPortal machineId={machineId} investor={{ name, payoutModel, payoutValue, machineIds }} />;
}
