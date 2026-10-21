"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, CircleAlert, Loader2, Sparkles, Wrench } from "lucide-react";
import type { TraceStep } from "@/domain";
import { cn } from "@/lib/utils";
import { useActiveShift, useOnline, useScenarios, useShiftArtifacts } from "@/capture/hooks";
import { processScenarios } from "@/capture/process";
import { useCaptureUi } from "@/capture/ui-store";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/capture/scenario-card";

const STAGES: { id: TraceStep["stage"]; label: string }[] = [
  { id: "ingest", label: "Ingest" },
  { id: "route", label: "Route" },
  { id: "match", label: "Match" },
  { id: "draft", label: "Draft" },
  { id: "gaps", label: "Gaps" },
  { id: "plan", label: "Plan" },
];

export function ProcessScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const online = useOnline();
  const shift = useActiveShift();
  const scenarios = useScenarios(shift?.id);
  const artifacts = useShiftArtifacts(shift?.id);
  const notify = useCaptureUi((s) => s.notify);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [animate, setAnimate] = useState(true);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<TraceStep[]>([]);
  const [preparing, setPreparing] = useState<string | null>(null);
  const autoRan = useRef(false);

  const eligible = (scenarios ?? []).filter((s) =>
    (artifacts ?? []).some((a) => a.scenarioId === s.id),
  );
  const preset = params.get("scenarios")?.split(",").filter(Boolean);
  const defaults = new Set(
    preset ??
      eligible.filter((s) => s.status === "ready" || s.status === "capturing").map((s) => s.id),
  );
  const selected = picked ?? defaults;

  async function run(ids: string[]) {
    setRunning(true);
    setSteps([]);
    try {
      const result = await processScenarios(ids, {
        animate,
        onPreparing: (a) =>
          setPreparing(`Reading ${a.modality} ${a.capturedAt.slice(11, 16)} on this device`),
        onStep: (s) => {
          setPreparing(null);
          setSteps((prev) => {
            const i = prev.findIndex((p) => p.id === s.id);
            if (i === -1) return [...prev, s];
            const next = [...prev];
            next[i] = s;
            return next;
          });
        },
      });
      router.push(`/review?cs=${encodeURIComponent(result.id)}`);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Processing failed", "error");
      setRunning(false);
    }
  }

  useEffect(() => {
    if (autoRan.current || params.get("run") !== "1" || !preset?.length || !online || !scenarios)
      return;
    autoRan.current = true;
    void run(preset);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when the scenarios load
  }, [scenarios]);

  if (!shift || !scenarios || !artifacts)
    return <p className="text-muted-foreground py-10 text-center">Loading…</p>;
  const reached = new Set(steps.map((s) => s.stage));

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Process</h1>
        <p className="text-muted-foreground">
          Turn scenarios into proposed changes. Nothing is written until you approve.
        </p>
      </header>

      {!running && (
        <>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Scenarios</legend>
            {eligible.length === 0 && (
              <div className="space-y-3 rounded-2xl border border-dashed p-4">
                <p className="text-muted-foreground">
                  No scenarios with captures yet. Capture something first, or load the demo day from
                  the menu on Today.
                </p>
                <div className="flex gap-2">
                  <Button asChild size="lg" className="h-12">
                    <Link href="/capture">Capture</Link>
                  </Button>
                  <Button asChild variant="outline" size="lg" className="h-12">
                    <Link href="/">Today</Link>
                  </Button>
                </div>
              </div>
            )}
            {eligible.map((s) => {
              const n = artifacts.filter((a) => a.scenarioId === s.id).length;
              const on = selected.has(s.id);
              return (
                <label
                  key={s.id}
                  className={cn(
                    "flex min-h-14 items-center gap-3 rounded-xl border px-3",
                    on && "border-foreground",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(s.id);
                      else next.delete(s.id);
                      setPicked(next);
                    }}
                    className="accent-foreground size-6"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{s.title}</span>
                    <span className="text-muted-foreground text-sm">
                      {n} capture{n === 1 ? "" : "s"}
                    </span>
                  </span>
                  <StatusPill status={s.status} />
                </label>
              );
            })}
          </fieldset>
          <label className="flex min-h-12 items-center gap-3">
            <input
              type="checkbox"
              checked={animate}
              onChange={(e) => setAnimate(e.target.checked)}
              className="accent-foreground size-5"
            />
            <span>Show each step as it runs</span>
          </label>
          <Button
            size="lg"
            className="h-14 w-full rounded-2xl text-base"
            disabled={selected.size === 0 || !online}
            onClick={() => run([...selected])}
          >
            <Sparkles aria-hidden />
            Process {selected.size} scenario{selected.size === 1 ? "" : "s"}
          </Button>
          {!online && (
            <p className="text-sm text-amber-800">
              Processing needs a connection. Your captures are safe on this device.
            </p>
          )}
        </>
      )}

      {running && (
        <section aria-live="polite" aria-label="Run trace" className="space-y-4">
          <ol className="flex gap-1">
            {STAGES.map((st) => (
              <li
                key={st.id}
                className={cn(
                  "flex-1 rounded-full py-1.5 text-center text-xs font-semibold",
                  reached.has(st.id)
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {st.label}
              </li>
            ))}
          </ol>
          {preparing && (
            <p className="flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {preparing}
            </p>
          )}
          <ol className="space-y-1.5">
            {steps.map((s) => (
              <li
                key={s.id}
                className="odd:bg-muted/40 flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm"
              >
                {s.status === "running" ? (
                  <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden />
                ) : s.status === "error" ? (
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden />
                ) : (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                )}
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{s.label}</span>
                  {s.tool && (
                    <span className="text-muted-foreground ml-1.5 inline-flex items-center gap-1 font-mono text-xs">
                      <Wrench className="size-3" aria-hidden />
                      {s.tool}
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground shrink-0 text-xs uppercase">{s.stage}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
