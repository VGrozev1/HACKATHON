import { SimulationView } from "@/components/simulation/simulation-view";

// Behind the operator sign-in in the layout, which reads the session cookie first:
// this page blocks on the server instead of being validated as an instant page.
export const instant = false;

export default function SimulationPage() {
  return <SimulationView />;
}
