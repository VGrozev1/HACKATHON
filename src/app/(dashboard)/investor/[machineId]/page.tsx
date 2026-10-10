import { Suspense } from "react";
import { InvestorView } from "@/components/investor/investor-view";
import { RowsSkeleton } from "@/components/states";

export default function InvestorPage({ params }: PageProps<"/investor/[machineId]">) {
  return (
    <Suspense fallback={<RowsSkeleton rows={8} className="mx-auto max-w-5xl" />}>
      <InvestorView params={params} />
    </Suspense>
  );
}
