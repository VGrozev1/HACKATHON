import { Suspense } from "react";
import { MyMachines } from "@/components/owner/my-machines";
import { GridSkeleton } from "@/components/states";
import { requireInvestor } from "@/lib/auth";

// requireInvestor can redirect() — that has to happen outside any
// <Suspense> boundary, or Next's Cache Components "instant navigation"
// validation errors out for a signed-out visitor instead of just
// redirecting them.
// The sign-in check reads the session cookie before rendering, so this route blocks on
// the server instead of serving a prerendered shell (lets the production build accept it).
export const instant = false;

export default async function OwnerHomePage() {
  const { name, payoutModel, payoutValue, machineIds } = await requireInvestor("/owner");
  return (
    <Suspense fallback={<GridSkeleton count={4} />}>
      <MyMachines investor={{ name, payoutModel, payoutValue, machineIds }} />
    </Suspense>
  );
}
