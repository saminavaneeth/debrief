"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Combine,
  MoreVertical,
  Pencil,
  Scissors,
  Target,
  Trash2,
} from "lucide-react";
import type { Artifact } from "@/domain";
import {
  useActiveShift,
  useCaptureTarget,
  useScenario,
  useScenarioArtifacts,
  useScenarios,
} from "@/capture/hooks";
import { AREAS, SITES } from "@/capture/reference";
import {
  deleteScenario,
  mergeScenarios,
  setSetting,
  SETTINGS,
  splitScenario,
  updateScenario,
} from "@/capture/repo";
import { summarizeScenario } from "@/capture/scenarios";
import { useCaptureUi } from "@/capture/ui-store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ArtifactCard } from "@/components/capture/artifact-card";
import { CaptureBar } from "@/components/capture/capture-bar";
import { MoveDialog } from "@/components/capture/move-dialog";
import { StatusPill } from "@/components/capture/scenario-card";

export function ScenarioScreen() {
  const router = useRouter();
  const id = useSearchParams().get("id");
  const shift = useActiveShift();
  const scenario = useScenario(id);
  const artifacts = useScenarioArtifacts(id);
  const scenarios = useScenarios(scenario?.shiftId);
  const target = useCaptureTarget();
  const notify = useCaptureUi((s) => s.notify);

  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState("");
  const [splitMode, setSplitMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moving, setMoving] = useState<Artifact | null>(null);
  const [merging, setMerging] = useState(false);

  if (scenario === undefined || artifacts === undefined || !shift) {
    return <p className="text-muted-foreground py-10 text-center">Loading…</p>;
  }
  if (scenario === null) {
    return (
      <div className="space-y-4 py-10 text-center">
        <p className="text-muted-foreground">This scenario no longer exists.</p>
        <Button asChild variant="outline" size="lg">
          <Link href="/">Back to Today</Link>
        </Button>
      </div>
    );
  }

  const others = (scenarios ?? []).filter((s) => s.id !== scenario.id);
  const editable = scenario.status === "capturing" || scenario.status === "ready";

  async function saveTitle() {
    const t = title.trim();
    if (t && t !== scenario!.title) await updateScenario(scenario!.id, { title: t });
    setRenaming(false);
  }

  async function doSplit() {
    try {
      const created = await splitScenario(scenario!.id, [...selected]);
      notify(`Split ${selected.size} into “${created.title}”`);
      setSplitMode(false);
      setSelected(new Set());
      router.push(`/scenario?id=${encodeURIComponent(created.id)}`);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not split", "error");
    }
  }

  async function doMerge(targetId: string, targetTitle: string) {
    await mergeScenarios(scenario!.id, targetId);
    setMerging(false);
    notify(`Merged into “${targetTitle}”`);
    router.replace(`/scenario?id=${encodeURIComponent(targetId)}`);
  }

  async function doDelete() {
    if (
      !window.confirm(
        `Delete “${scenario!.title}”? Its ${artifacts!.length} capture(s) move to the Inbox.`,
      )
    )
      return;
    await deleteScenario(scenario!.id);
    notify("Scenario deleted; captures moved to Inbox");
    router.push("/");
  }

  return (
    <div className="space-y-6">
      <div className="-ml-2 flex items-center">
        <Button asChild variant="ghost" size="lg" className="h-11">
          <Link href="/">
            <ArrowLeft aria-hidden />
            Today
          </Link>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-lg"
              className="ml-auto size-12"
              aria-label="Scenario actions"
            >
              <MoreVertical aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem
              className="min-h-12 gap-3 text-base"
              onSelect={() => {
                setTitle(scenario.title);
                setRenaming(true);
              }}
            >
              <Pencil aria-hidden />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              className="min-h-12 gap-3 text-base"
              disabled={artifacts.length < 2}
              onSelect={() => setSplitMode(true)}
            >
              <Scissors aria-hidden />
              Split captures
            </DropdownMenuItem>
            <DropdownMenuItem
              className="min-h-12 gap-3 text-base"
              disabled={others.length === 0}
              onSelect={() => setMerging(true)}
            >
              <Combine aria-hidden />
              Merge into…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="min-h-12 gap-3 text-base"
              variant="destructive"
              onSelect={doDelete}
            >
              <Trash2 aria-hidden />
              Delete scenario
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <header className="space-y-3">
        {renaming ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveTitle();
            }}
            className="flex gap-2"
          >
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => void saveTitle()}
              aria-label="Scenario title"
              className="h-12 text-lg font-semibold"
            />
            <Button type="submit" size="icon-lg" className="size-12" aria-label="Save title">
              <Check aria-hidden />
            </Button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setTitle(scenario.title);
              setRenaming(true);
            }}
            className="text-left text-2xl leading-tight font-semibold tracking-tight"
          >
            {scenario.title}
          </button>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={scenario.status} />
          {editable && (
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() =>
                updateScenario(scenario.id, {
                  status: scenario.status === "ready" ? "capturing" : "ready",
                })
              }
            >
              {scenario.status === "ready" ? "Keep capturing" : "Mark ready to process"}
            </Button>
          )}
          {target !== scenario.id ? (
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={async () => {
                await setSetting(SETTINGS.captureTarget, scenario.id);
                notify("New captures will go to this scenario");
              }}
            >
              <Target aria-hidden />
              Capture here
            </Button>
          ) : (
            <span className="text-sm font-medium">Capture target</span>
          )}
        </div>
        <select
          aria-label="Area"
          value={scenario.areaId ?? ""}
          onChange={(e) =>
            updateScenario(
              scenario.id,
              e.target.value
                ? { areaId: e.target.value, siteId: e.target.value.split(".")[0] }
                : { areaId: undefined },
            )
          }
          className="bg-background h-12 w-full rounded-md border px-3 text-base"
        >
          <option value="">Area not set</option>
          {SITES.map((s) => (
            <optgroup key={s.id} label={s.name}>
              {AREAS.filter((a) => a.siteId === s.id).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <p className="bg-muted/60 rounded-xl p-3 text-[15px] leading-snug">
          {summarizeScenario(scenario, artifacts)}
        </p>
      </header>

      {editable && (
        <section aria-labelledby="add-title" className="space-y-3">
          <h2 id="add-title" className="text-lg font-semibold">
            Add to this scenario
          </h2>
          <CaptureBar shift={shift} target={scenario.id} />
        </section>
      )}

      <section aria-labelledby="timeline-title" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="timeline-title" className="text-lg font-semibold">
            Captures ({artifacts.length})
          </h2>
          {splitMode && (
            <Button
              variant="ghost"
              size="lg"
              className="h-11"
              onClick={() => {
                setSplitMode(false);
                setSelected(new Set());
              }}
            >
              Cancel
            </Button>
          )}
        </div>
        {splitMode && (
          <p className="text-muted-foreground text-sm">
            Select the captures that belong to a different situation.
          </p>
        )}
        {artifacts.length === 0 && <p className="text-muted-foreground">No captures yet.</p>}
        <ol className="space-y-3">
          {artifacts.map((a) => (
            <li key={a.id}>
              <ArtifactCard
                artifact={a}
                onMove={splitMode ? undefined : setMoving}
                selectable={splitMode}
                selected={selected.has(a.id)}
                onSelect={(aid, on) =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (on) next.add(aid);
                    else next.delete(aid);
                    return next;
                  })
                }
              />
            </li>
          ))}
        </ol>
        {splitMode && (
          <div className="sticky bottom-20 z-10">
            <Button
              size="lg"
              className="h-14 w-full text-base shadow-lg"
              disabled={selected.size === 0}
              onClick={doSplit}
            >
              <Scissors aria-hidden />
              Split {selected.size || ""} into a new scenario
            </Button>
          </div>
        )}
      </section>

      {moving && (
        <MoveDialog
          shift={shift}
          artifactIds={[moving.id]}
          currentScenarioId={scenario.id}
          open={!!moving}
          onOpenChange={(open) => !open && setMoving(null)}
        />
      )}

      <Dialog open={merging} onOpenChange={setMerging}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Merge into…</DialogTitle>
            <DialogDescription>
              All {artifacts.length} captures move there and this scenario is removed.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60dvh] space-y-2 overflow-y-auto">
            {others.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => doMerge(s.id, s.title)}
                className="hover:bg-muted flex min-h-14 w-full items-center rounded-xl border px-4 text-left text-base"
              >
                {s.title}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
