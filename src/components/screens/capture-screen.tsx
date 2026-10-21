"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useActiveShift, useCaptureTarget, useScenarios, useShiftArtifacts } from "@/capture/hooks";
import { createScenario, setSetting, SETTINGS } from "@/capture/repo";
import { useCaptureUi } from "@/capture/ui-store";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ArtifactCard } from "@/components/capture/artifact-card";
import { CaptureBar } from "@/components/capture/capture-bar";

export function CaptureScreen() {
  const shift = useActiveShift();
  const scenarios = useScenarios(shift?.id);
  const artifacts = useShiftArtifacts(shift?.id);
  const target = useCaptureTarget();
  const notify = useCaptureUi((s) => s.notify);

  if (!shift || !scenarios || !artifacts || target === undefined) {
    return <p className="text-muted-foreground py-10 text-center">Loading…</p>;
  }
  const validTarget = target && scenarios.some((s) => s.id === target) ? target : null;
  const recent = [...artifacts].reverse().slice(0, 5);

  async function newScenario() {
    const s = await createScenario(shift!);
    await setSetting(SETTINGS.captureTarget, s.id);
    notify(`Capturing to ${s.title}`);
  }

  return (
    <div className="space-y-6">
      <h1 className="sr-only">Capture</h1>
      <div className="space-y-1.5">
        <Label htmlFor="capture-target">Saving to</Label>
        <div className="flex gap-2">
          <select
            id="capture-target"
            value={validTarget ?? ""}
            onChange={(e) => void setSetting(SETTINGS.captureTarget, e.target.value || null)}
            className="bg-background h-12 min-w-0 flex-1 rounded-md border px-3 text-base"
          >
            <option value="">Inbox (sort later)</option>
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
          <Button variant="outline" size="lg" className="h-12" onClick={newScenario}>
            <Plus aria-hidden />
            New
          </Button>
        </div>
      </div>

      <CaptureBar shift={shift} target={validTarget} />

      {recent.length > 0 && (
        <section aria-labelledby="recent-title" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 id="recent-title" className="text-lg font-semibold">
              Recent captures
            </h2>
            {validTarget && (
              <Link
                href={`/scenario?id=${encodeURIComponent(validTarget)}`}
                className="text-sm font-medium underline-offset-4 hover:underline"
              >
                Open scenario
              </Link>
            )}
          </div>
          {recent.map((a) => (
            <ArtifactCard key={a.id} artifact={a} />
          ))}
        </section>
      )}
    </div>
  );
}
