"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useOnline } from "@/capture/hooks";

/** Unread workflow notifications; opens the Platform activity feed. */
export function NotificationBell() {
  const online = useOnline();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!online) return;
    let stop = false;
    const tick = () =>
      fetch("/api/platform?view=summary", { cache: "no-store" })
        .then((r) => r.json() as Promise<{ unread: number }>)
        .then((s) => !stop && setUnread(s.unread))
        .catch(() => {});
    void tick();
    const t = setInterval(tick, 15_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [online]);
  return (
    <Link
      href="/platform?tab=activity"
      aria-label={unread ? `${unread} unread notifications` : "Notifications"}
      className="hover:bg-muted relative inline-flex size-12 items-center justify-center rounded-md"
    >
      <Bell className="size-5" aria-hidden />
      {unread > 0 && (
        <span className="absolute top-2 right-1.5 min-w-4 rounded-full bg-sky-600 px-1 text-center text-[10px] leading-4 font-bold text-white">
          {unread}
        </span>
      )}
    </Link>
  );
}
