import { ArtifactEditorHost } from "@/components/capture/artifact-editor";
import { NoticeHost } from "@/components/capture/notice-host";
import { AppHeader } from "@/components/shell/app-header";
import { BottomTabs } from "@/components/shell/bottom-tabs";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <AppHeader />
      <main className="flex-1 px-4 pt-4 pb-28">{children}</main>
      <BottomTabs />
      <ArtifactEditorHost />
      <NoticeHost />
    </div>
  );
}
