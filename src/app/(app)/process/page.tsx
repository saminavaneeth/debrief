import { Suspense } from "react";
import { ProcessScreen } from "@/components/screens/process-screen";

export default function Page() {
  return (
    <Suspense>
      <ProcessScreen />
    </Suspense>
  );
}
