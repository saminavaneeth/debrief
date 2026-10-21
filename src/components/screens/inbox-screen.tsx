"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, FolderInput, Plus } from "lucide-react";
import type { Artifact } from "@/domain";
import { useActiveShift, useShiftArtifacts } from "@/capture/hooks";
import { createScenario, moveArtifacts } from "@/capture/repo";
import { useCaptureUi } from "@/capture/ui-store";
import { Button } from "@/components/ui/button";
import { ArtifactCard } from "@/components/capture/artifact-card";
import { MoveDialog } from "@/components/capture/move-dialog";

/** Captures not yet assigned to a scenario. Sort them into scenarios any time. */
export function InboxScreen() {
  const router = useRouter();
  const shift = useActiveShift();
  const artifacts = useShiftArtifacts(shift?.id);
  const notify = useCaptureUi((s) => s.notify);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveIds, setMoveIds] = useState<string[] | null>(null);

  if (!shift || !artifacts)
    return <p className="text-muted-foreground py-10 text-center">Loading…</p>;
  const inbox = artifacts.filter((a) => a.scenarioId === null);
  // Drop selections for captures that have left the Inbox.
  const chosen = [...selected].filter((id) => inbox.some((a) => a.id === id));

  async function newScenarioFrom(ids: string[]) {
    const first = inbox.find((a) => a.id === ids[0]) as Artifact;
    const s = await createScenario(shift!, { areaId: first?.areaId });
    await moveArtifacts(ids, s.id);
    setSelected(new Set());
    notify(`Created “${s.title}”`);
    router.push(`/scenario?id=${encodeURIComponent(s.id)}`);
  }

  return (
    <div className="space-y-5">
      <div className="-ml-2">
        <Button asChild variant="ghost" size="lg" className="h-11">
          <Link href="/">
            <ArrowLeft aria-hidden />
            Today
          </Link>
        </Button>
      </div>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
        <p className="text-muted-foreground">
          Captures not in a scenario yet. Select some to start a scenario, or move them into one.
        </p>
      </header>

      {inbox.length === 0 ? (
        <div className="text-muted-foreground rounded-2xl border border-dashed p-6 text-center">
          Nothing to sort. Captures saved to the Inbox appear here.
        </div>
      ) : (
        <ol className="space-y-3">
          {inbox.map((a) => (
            <li key={a.id}>
              <ArtifactCard
                artifact={a}
                onMove={(art) => setMoveIds([art.id])}
                selectable
                selected={selected.has(a.id)}
                onSelect={(id, on) =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (on) next.add(id);
                    else next.delete(id);
                    return next;
                  })
                }
              />
            </li>
          ))}
        </ol>
      )}

      {chosen.length > 0 && (
        <div className="sticky bottom-20 z-10 grid grid-cols-2 gap-2">
          <Button
            size="lg"
            className="h-14 text-base shadow-lg"
            onClick={() => newScenarioFrom(chosen)}
          >
            <Plus aria-hidden />
            New scenario
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="h-14 text-base shadow-lg"
            onClick={() => setMoveIds(chosen)}
          >
            <FolderInput aria-hidden />
            Move {chosen.length}
          </Button>
        </div>
      )}

      {moveIds && (
        <MoveDialog
          shift={shift}
          artifactIds={moveIds}
          currentScenarioId={null}
          open
          onOpenChange={(open) => !open && setMoveIds(null)}
          onMoved={() => setSelected(new Set())}
        />
      )}
    </div>
  );
}
