import { Suspense } from "react";
import { ScenarioScreen } from "@/components/screens/scenario-screen";

/** `/scenario?id=…` — a single static route, so it is cached for offline use. */
export default function ScenarioPage() {
  return (
    <Suspense>
      <ScenarioScreen />
    </Suspense>
  );
}
