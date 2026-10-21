"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Camera, ClipboardCheck, Database, Network } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/", label: "Today", icon: CalendarDays },
  { href: "/capture", label: "Capture", icon: Camera },
  { href: "/review", label: "Review", icon: ClipboardCheck },
  { href: "/records", label: "Records", icon: Database },
  { href: "/platform", label: "Platform", icon: Network },
] as const;

export function BottomTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="bg-background fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md border-t pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid grid-cols-5">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/"
              ? pathname === "/" ||
                pathname.startsWith("/scenario") ||
                pathname.startsWith("/inbox")
              : href === "/review"
                ? ["/review", "/process", "/results"].some((p) => pathname.startsWith(p))
                : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <Icon className="size-6" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
