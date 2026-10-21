"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Inbox, Mic, PlayCircle, Plus, Sparkles } from "lucide-react";
import { useActiveShift, useCaptureTarget, useScenarios, useShiftArtifacts } from "@/capture/hooks";
import { personName, siteName } from "@/capture/reference";
import { createScenario, loadDemoDay, setSetting, SETTINGS } from "@/capture/repo";
import { useCaptureUi } from "@/capture/ui-store";
import { localDate } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { ScenarioCard } from "@/components/capture/scenario-card";
import { ModalityIcon } from "@/components/capture/modality";

function formatShiftDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function TodayScreen() {
  const router = useRouter();
  const shift = useActiveShift();
  const scenarios = useScenarios(shift?.id);
  const artifacts = useShiftArtifacts(shift?.id);
  const target = useCaptureTarget();
  const notify = useCaptureUi((s) => s.notify);

  if (!shift || !scenarios || !artifacts) {
    return <p className="text-muted-foreground py-10 text-center">Loading your shift…</p>;
  }

  const inbox = artifacts.filter((a) => a.scenarioId === null);
  const readyCount = scenarios.filter(
    (s) =>
      (s.status === "ready" || s.status === "capturing") &&
      artifacts.some((a) => a.scenarioId === s.id),
  ).length;
  const isToday = shift.date === localDate();

  async function newScenario() {
    const s = await createScenario(shift!);
    await setSetting(SETTINGS.captureTarget, s.id);
    router.push(`/scenario?id=${encodeURIComponent(s.id)}`);
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="shift-title" className="space-y-1">
        <p className="text-muted-foreground text-sm font-medium">
          {isToday ? "Today's shift" : "Shift"}
        </p>
        <h1 id="shift-title" className="text-2xl font-semibold tracking-tight">
          {formatShiftDate(shift.date)}
        </h1>
        <p className="text-muted-foreground text-sm">
          {personName(shift.userId)} · {siteName(shift.siteId)} · {scenarios.length} scenario
          {scenarios.length === 1 ? "" : "s"} · {artifacts.length} capture
          {artifacts.length === 1 ? "" : "s"}
        </p>
      </section>

      <Button asChild size="lg" className="h-16 w-full rounded-2xl text-lg">
        <Link href="/capture">
          <Mic className="size-6" aria-hidden />
          Capture
        </Link>
      </Button>

      {readyCount > 0 && (
        <Button asChild variant="outline" size="lg" className="h-14 w-full rounded-2xl text-base">
          <Link href="/process">
            <Sparkles className="size-5" aria-hidden />
            Process {readyCount} scenario{readyCount === 1 ? "" : "s"}
          </Link>
        </Button>
      )}

      <section aria-labelledby="scenarios-title" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="scenarios-title" className="text-lg font-semibold">
            Scenarios
          </h2>
          <Button variant="outline" size="lg" className="h-11" onClick={newScenario}>
            <Plus aria-hidden />
            New
          </Button>
        </div>
        {scenarios.length === 0 ? (
          <div className="space-y-3 rounded-2xl border border-dashed p-5 text-center">
            <p className="text-muted-foreground">
              No scenarios yet. Capture something, or group Inbox captures into a scenario.
            </p>
            <Button
              variant="outline"
              size="lg"
              className="h-12"
              onClick={async () => {
                await loadDemoDay();
                notify("Demo day loaded");
              }}
            >
              <PlayCircle aria-hidden />
              Load demo day
            </Button>
          </div>
        ) : (
          <ul className="space-y-3">
            {scenarios.map((s) => (
              <li key={s.id}>
                <ScenarioCard
                  scenario={s}
                  artifacts={artifacts.filter((a) => a.scenarioId === s.id)}
                  isTarget={target === s.id}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="inbox-title" className="space-y-3">
        <Link
          href="/inbox"
          className="bg-card hover:bg-muted/50 flex min-h-12 items-center gap-2 rounded-2xl border px-4 py-3"
        >
          <Inbox className="size-5" aria-hidden />
          <h2 id="inbox-title" className="font-semibold">
            Inbox
          </h2>
          <span className="bg-muted rounded-full px-2 text-sm tabular-nums">{inbox.length}</span>
          <span className="text-muted-foreground ml-auto text-sm">
            {inbox.length ? "Sort captures" : "Empty"}
          </span>
          <ChevronRight className="text-muted-foreground size-5" aria-hidden />
        </Link>
        {inbox.slice(0, 3).map((a) => (
          <Link
            key={a.id}
            href="/inbox"
            className="hover:bg-muted/50 flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm"
          >
            <ModalityIcon modality={a.modality} className="text-muted-foreground size-4 shrink-0" />
            <span className="text-muted-foreground tabular-nums">{a.capturedAt.slice(11, 16)}</span>
            <span className="truncate">{a.text ?? a.media?.fileName ?? "Untitled capture"}</span>
          </Link>
        ))}
      </section>
    </div>
  );
}
