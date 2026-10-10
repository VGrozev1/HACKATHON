import { Suspense } from "react";
import { OwnerPortal } from "@/components/owner/owner-portal";
import { GridSkeleton } from "@/components/states";

export default function OwnerPage({ params }: PageProps<"/owner/[machineId]">) {
  return (
    <Suspense fallback={<GridSkeleton count={4} />}>
      <OwnerPortal params={params} />
    </Suspense>
  );
}
