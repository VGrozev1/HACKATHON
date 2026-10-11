import { Suspense } from "react";
import { InvestorView } from "@/components/investor/investor-view";
import { RowsSkeleton } from "@/components/states";

// Behind the operator sign-in in the layout, which reads the session cookie first:
// this page blocks on the server instead of being validated as an instant page.
export const instant = false;

export default function InvestorPage({ params }: PageProps<"/investor/[machineId]">) {
  return (
    <Suspense fallback={<RowsSkeleton rows={8} className="mx-auto max-w-5xl" />}>
      <InvestorView params={params} />
    </Suspense>
  );
}
