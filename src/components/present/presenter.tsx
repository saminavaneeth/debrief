"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, PlayCircle, RotateCcw, Smartphone } from "lucide-react";
import { clearLocalData, loadDemoDay } from "@/capture/repo";
import { DemoEngineBadge } from "@/components/shell/demo-engine-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DEMO_STEPS, type DemoStep } from "./script";

const PHONE_START = "/";
const SIDE_START = "/console?server=incidents";

const SIDE_TABS = [
  { label: "EHS console", path: "/console?server=incidents", match: "/console" },
  { label: "Platform", path: "/platform?tab=systems", match: "/platform" },
] as const;

function currentPath(frame: HTMLIFrameElement | null): string | null {
  try {
    const loc = frame?.contentWindow?.location;
    return loc ? `${loc.pathname}${loc.search}` : null;
  } catch {
    return null;
  }
}

function go(frame: HTMLIFrameElement | null, path: string) {
  const win = frame?.contentWindow;
  if (win) win.location.assign(path);
}

/**
 * Presenter view: the demo script, the capture app at phone size, and a live EHS console or
 * Platform pane. Record links opened in the phone are shown in the right-hand pane instead.
 */
export function Presenter() {
  const phone = useRef<HTMLIFrameElement>(null);
  const side = useRef<HTMLIFrameElement>(null);
  const [phonePath, setPhonePath] = useState(PHONE_START);
  const [sidePath, setSidePath] = useState(SIDE_START);
  const [active, setActive] = useState<string>(DEMO_STEPS[0]!.id);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Track both frames (client-side navigation fires no load event) and hand console links
  // from the phone to the side pane.
  useEffect(() => {
    const t = setInterval(() => {
      const p = currentPath(phone.current);
      if (p?.startsWith("/console")) {
        go(side.current, p);
        phone.current?.contentWindow?.history.back();
      } else if (p) {
        setPhonePath(p);
      }
      const s = currentPath(side.current);
      if (s) setSidePath(s);
    }, 400);
    return () => clearInterval(t);
  }, []);

  const flash = useCallback((text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(null), 3000);
  }, []);

  function openStep(step: DemoStep) {
    setActive(step.id);
    if (step.phone) go(phone.current, step.phone);
    if (step.side) go(side.current, step.side);
  }

  async function runAction(step: DemoStep) {
    if (step.action !== "loadDemoDay") return;
    setBusy(true);
    try {
      await loadDemoDay();
      go(phone.current, "/");
      flash("Demo day loaded");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!window.confirm("Reset the demo? Captures and EHS systems go back to the seed data.")) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/demo/reset", { method: "POST" }).catch(() => null);
      await clearLocalData();
      go(phone.current, PHONE_START);
      go(side.current, SIDE_START);
      setActive(DEMO_STEPS[0]!.id);
      flash(res?.ok ? "Demo reset" : "Captures cleared; the EHS systems could not be reached");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-muted/40 flex h-dvh flex-col">
      <header className="bg-background flex items-center gap-3 border-b px-4 py-2">
        <h1 className="text-lg font-semibold">Debrief</h1>
        <span className="text-muted-foreground text-sm">Presenter</span>
        <DemoEngineBadge />
        <div className="ml-auto flex items-center gap-2">
          {notice && (
            <span role="status" className="text-sm text-emerald-700">
              {notice}
            </span>
          )}
          <Button variant="outline" onClick={reset} disabled={busy}>
            <RotateCcw aria-hidden />
            Reset demo
          </Button>
        </div>
      </header>

      {/* Below desktop width the three panes do not fit. */}
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center lg:hidden">
        <Smartphone className="text-muted-foreground size-8" aria-hidden />
        <p className="max-w-sm">
          The presenter view needs a wide screen. On a phone, use the app directly.
        </p>
        <Button asChild>
          <Link href="/">Open the app</Link>
        </Button>
      </div>

      <div className="hidden min-h-0 flex-1 gap-4 p-4 lg:flex">
        <nav aria-label="Demo script" className="w-72 shrink-0 overflow-y-auto xl:w-80">
          <h2 className="mb-2 text-sm font-semibold tracking-wide uppercase">3-minute script</h2>
          <ol className="space-y-2">
            {DEMO_STEPS.map((step, i) => {
              const on = step.id === active;
              return (
                <li key={step.id}>
                  <div
                    className={cn(
                      "bg-background rounded-xl border p-3 text-sm",
                      on && "border-sky-500 ring-1 ring-sky-500",
                    )}
                  >
                    <button
                      type="button"
                      className="flex w-full items-baseline gap-2 text-left"
                      aria-current={on ? "step" : undefined}
                      onClick={() => openStep(step)}
                    >
                      <span className="text-muted-foreground font-mono text-xs">{step.at}</span>
                      <span className="font-semibold">
                        {i + 1}. {step.title}
                      </span>
                    </button>
                    {on && (
                      <>
                        <ul className="mt-2 list-disc space-y-1 pl-4">
                          {step.points.map((p) => (
                            <li key={p}>{p}</li>
                          ))}
                        </ul>
                        {step.action === "loadDemoDay" && (
                          <Button
                            size="sm"
                            className="mt-3"
                            onClick={() => runAction(step)}
                            disabled={busy}
                          >
                            <PlayCircle aria-hidden />
                            Load demo day
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </nav>

        <section aria-label="Phone" className="flex shrink-0 flex-col items-center gap-2">
          <div className="aspect-[390/844] h-[min(844px,calc(100dvh-7.5rem))] overflow-hidden rounded-[2.5rem] border-[10px] border-slate-900 bg-white shadow-xl">
            <iframe
              ref={phone}
              src={PHONE_START}
              title="Debrief capture app at phone size"
              className="size-full"
              allow="microphone; camera"
            />
          </div>
          <p className="text-muted-foreground max-w-[22rem] truncate font-mono text-xs">
            {phonePath}
          </p>
        </section>

        <section
          aria-label="EHS systems"
          className="bg-background flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border"
        >
          <div className="flex items-center gap-1 border-b px-2 py-1">
            {SIDE_TABS.map((tab) => (
              <Button
                key={tab.label}
                variant={sidePath.startsWith(tab.match) ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={sidePath.startsWith(tab.match)}
                onClick={() => go(side.current, tab.path)}
              >
                {tab.label}
              </Button>
            ))}
            <span className="text-muted-foreground ml-auto truncate font-mono text-xs">
              {sidePath}
            </span>
            <Button variant="ghost" size="icon-sm" asChild>
              <a href={sidePath} target="_blank" rel="noreferrer" aria-label="Open in a new tab">
                <ExternalLink aria-hidden />
              </a>
            </Button>
          </div>
          <iframe ref={side} src={SIDE_START} title="EHS systems" className="min-h-0 flex-1" />
        </section>
      </div>
    </div>
  );
}
