"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarPlus, Database, MoreVertical, PlayCircle, RotateCcw } from "lucide-react";
import { clearLocalData, loadDemoDay, startShift } from "@/capture/repo";
import { useCaptureUi } from "@/capture/ui-store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AppMenu() {
  const router = useRouter();
  const notify = useCaptureUi((s) => s.notify);

  async function onLoadDemo() {
    await loadDemoDay();
    notify("Demo day loaded: 6 scenarios, 1 Inbox capture");
    router.push("/");
  }

  async function onNewShift() {
    await startShift();
    notify("Started today's shift");
    router.push("/");
  }

  async function onReset() {
    if (
      !window.confirm(
        "Reset the demo? This deletes all captures on this device and restores the EHS systems to their seed data.",
      )
    ) {
      return;
    }
    let serverOk = true;
    try {
      const res = await fetch("/api/demo/reset", { method: "POST" });
      serverOk = res.ok;
    } catch {
      serverOk = false;
    }
    await clearLocalData();
    notify(
      serverOk ? "Demo reset" : "Captures cleared. EHS systems reset needs a connection.",
      serverOk ? "info" : "error",
    );
    router.push("/");
  }

  const item = "min-h-12 gap-3 text-base";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-lg" className="size-12" aria-label="Menu">
          <MoreVertical aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem className={item} onSelect={onLoadDemo}>
          <PlayCircle aria-hidden />
          Load demo day
        </DropdownMenuItem>
        <DropdownMenuItem className={item} onSelect={onNewShift}>
          <CalendarPlus aria-hidden />
          Start today&apos;s shift
        </DropdownMenuItem>
        <DropdownMenuItem className={item} asChild>
          <Link href="/console">
            <Database aria-hidden />
            EHS console
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className={item} variant="destructive" onSelect={onReset}>
          <RotateCcw aria-hidden />
          Reset demo
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
