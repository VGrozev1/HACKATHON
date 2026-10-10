import { Suspense } from "react";
import { MachineDetail } from "@/components/machine/machine-detail";
import { GridSkeleton } from "@/components/states";

export default function MachinePage({ params }: PageProps<"/machines/[id]">) {
  return (
    <Suspense fallback={<GridSkeleton count={4} className="xl:grid-cols-2 2xl:grid-cols-2" />}>
      <MachineDetail params={params} />
    </Suspense>
  );
}
