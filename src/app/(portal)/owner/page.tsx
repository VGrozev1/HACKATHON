import { Suspense } from "react";
import { MyMachines } from "@/components/owner/my-machines";
import { GridSkeleton } from "@/components/states";
import { requireInvestor } from "@/lib/auth";

// requireInvestor can redirect() — that has to happen outside any
// <Suspense> boundary, or Next's Cache Components "instant navigation"
// validation errors out for a signed-out visitor instead of just
// redirecting them.
export default async function OwnerHomePage() {
  const { name, payoutModel, payoutValue, machineIds } = await requireInvestor("/owner");
  return (
    <Suspense fallback={<GridSkeleton count={4} />}>
      <MyMachines investor={{ name, payoutModel, payoutValue, machineIds }} />
    </Suspense>
  );
}
