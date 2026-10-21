"use client";

import { WifiOff } from "lucide-react";
import { useOnline } from "@/capture/hooks";

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      className="flex items-center gap-2 bg-amber-100 px-4 py-2 text-sm font-medium text-amber-950"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden />
      Offline. Captures are saved on this device; processing waits for a connection.
    </div>
  );
}
