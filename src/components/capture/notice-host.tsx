"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useCaptureUi } from "@/capture/ui-store";

/** Short confirmation messages ("Saved to Inbox"), announced to screen readers. */
export function NoticeHost() {
  const notice = useCaptureUi((s) => s.notice);
  const clear = useCaptureUi((s) => s.clearNotice);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(clear, notice.tone === "error" ? 6000 : 2800);
    return () => clearTimeout(t);
  }, [notice, clear]);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-50 mx-auto flex max-w-md justify-center px-4"
    >
      {notice && (
        <p
          key={notice.id}
          className={cn(
            "pointer-events-auto rounded-full px-4 py-2.5 text-sm font-medium shadow-lg",
            notice.tone === "error" ? "bg-red-700 text-white" : "bg-foreground text-background",
          )}
        >
          {notice.text}
        </p>
      )}
    </div>
  );
}
