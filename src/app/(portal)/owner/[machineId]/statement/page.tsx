import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { InvestorView } from "@/components/investor/investor-view";
import { RowsSkeleton } from "@/components/states";
import { requireInvestor } from "@/lib/auth";
import { payoutTerms } from "@/lib/insights";

export default function PortalStatementPage({ params }: PageProps<"/owner/[machineId]/statement">) {
  return (
    <Suspense fallback={<RowsSkeleton rows={8} className="mx-auto max-w-5xl" />}>
      <GuardedStatement params={params} />
    </Suspense>
  );
}

/** The investor's own statement: their machines only, locked to their payout terms. */
async function GuardedStatement({ params }: { params: Promise<{ machineId: string }> }) {
  const { machineId } = await params;
  const investor = await requireInvestor(`/owner/${machineId}/statement`);
  if (!investor.machineIds.includes(machineId)) redirect("/owner");
  return (
    <>
      <Link href={`/owner/${machineId}`} className="mx-auto mb-4 block max-w-5xl text-sm font-bold tracking-wider text-primary uppercase hover:underline">
        ← Back to the machine
      </Link>
      <InvestorView
        params={params}
        basePath="/owner"
        fixed={{
          model: investor.payoutModel,
          value: investor.payoutValue,
          terms: payoutTerms(investor),
          machineIds: investor.machineIds,
        }}
      />
    </>
  );
}
