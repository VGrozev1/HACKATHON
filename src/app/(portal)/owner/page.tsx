import { Suspense } from "react";
import { MyMachines } from "@/components/owner/my-machines";
import { GridSkeleton } from "@/components/states";
import { requireInvestor } from "@/lib/auth";

export default function OwnerHomePage() {
  return (
    <Suspense fallback={<GridSkeleton count={4} />}>
      <Portfolio />
    </Suspense>
  );
}

async function Portfolio() {
  const { name, payoutModel, payoutValue, machineIds } = await requireInvestor("/owner");
  return <MyMachines investor={{ name, payoutModel, payoutValue, machineIds }} />;
}
