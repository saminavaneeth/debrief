import { DemoEngineBadge } from "@/components/shell/demo-engine-badge";

export function AppHeader() {
  return (
    <header className="bg-background/95 sticky top-0 z-10 flex h-14 items-center justify-between border-b px-4 backdrop-blur">
      <span className="text-lg font-semibold tracking-tight">Debrief</span>
      <DemoEngineBadge />
    </header>
  );
}
