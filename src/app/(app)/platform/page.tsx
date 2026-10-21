import { Suspense } from "react";
import { PlatformScreen } from "@/components/screens/platform-screen";

export default function PlatformPage() {
  return (
    <Suspense>
      <PlatformScreen />
    </Suspense>
  );
}
