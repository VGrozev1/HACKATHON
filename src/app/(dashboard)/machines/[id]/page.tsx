import { Suspense } from "react";
import { MachineDetail } from "@/components/machine/machine-detail";
import { GridSkeleton } from "@/components/states";

// Behind the operator sign-in in the layout, which reads the session cookie first:
// this page blocks on the server instead of being validated as an instant page.
export const instant = false;

export default function MachinePage({ params }: PageProps<"/machines/[id]">) {
  return (
    <Suspense fallback={<GridSkeleton count={4} className="xl:grid-cols-2 2xl:grid-cols-2" />}>
      <MachineDetail params={params} />
    </Suspense>
  );
}
