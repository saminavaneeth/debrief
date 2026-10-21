import type { Metadata } from "next";
import { Suspense } from "react";
import { EhsConsole } from "@/components/console/ehs-console";

export const metadata: Metadata = { title: "EHS console · Debrief" };

export default function ConsolePage() {
  return (
    <Suspense>
      <EhsConsole />
    </Suspense>
  );
}
