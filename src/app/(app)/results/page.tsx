import { Suspense } from "react";
import { ResultsScreen } from "@/components/screens/results-screen";

export default function Page() {
  return (
    <Suspense>
      <ResultsScreen />
    </Suspense>
  );
}
