import { Suspense } from "react";
import { ReviewScreen } from "@/components/screens/review-screen";

export default function Page() {
  return (
    <Suspense>
      <ReviewScreen />
    </Suspense>
  );
}
