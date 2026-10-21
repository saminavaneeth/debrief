import Link from "next/link";
import { OfflineBanner } from "@/components/capture/offline-banner";
import { AppMenu } from "@/components/shell/app-menu";
import { DemoEngineBadge } from "@/components/shell/demo-engine-badge";

export function AppHeader() {
  return (
    <header className="bg-background/95 sticky top-0 z-20 border-b backdrop-blur">
      <div className="flex h-14 items-center justify-between gap-2 pr-1 pl-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Debrief
        </Link>
        <div className="flex items-center gap-1">
          <DemoEngineBadge />
          <AppMenu />
        </div>
      </div>
      <OfflineBanner />
    </header>
  );
}
