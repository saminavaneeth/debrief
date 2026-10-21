import { AppHeader } from "@/components/shell/app-header";
import { BottomTabs } from "@/components/shell/bottom-tabs";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <AppHeader />
      <main className="flex-1 px-4 pt-4 pb-24">{children}</main>
      <BottomTabs />
    </div>
  );
}
