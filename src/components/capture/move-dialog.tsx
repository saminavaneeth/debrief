"use client";

import { Inbox, Plus } from "lucide-react";
import type { Shift } from "@/domain";
import { cn } from "@/lib/utils";
import { useScenarios } from "@/capture/hooks";
import { createScenario, moveArtifacts } from "@/capture/repo";
import { useCaptureUi } from "@/capture/ui-store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Move captures to another scenario, the Inbox, or a new scenario. */
export function MoveDialog({
  shift,
  artifactIds,
  currentScenarioId,
  open,
  onOpenChange,
  onMoved,
}: {
  shift: Shift;
  artifactIds: string[];
  currentScenarioId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMoved?: () => void;
}) {
  const scenarios = useScenarios(shift.id) ?? [];
  const notify = useCaptureUi((s) => s.notify);
  const n = artifactIds.length;

  async function moveTo(scenarioId: string | null, label: string) {
    await moveArtifacts(artifactIds, scenarioId);
    notify(`Moved ${n === 1 ? "capture" : `${n} captures`} to ${label}`);
    onOpenChange(false);
    onMoved?.();
  }

  async function moveToNew() {
    const s = await createScenario(shift);
    await moveTo(s.id, s.title);
  }

  const row =
    "flex min-h-14 w-full items-center gap-3 rounded-xl border px-4 text-left text-base hover:bg-muted disabled:opacity-50";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Move {n === 1 ? "capture" : `${n} captures`}</DialogTitle>
          <DialogDescription>
            Choose where {n === 1 ? "it belongs" : "they belong"}.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60dvh] space-y-2 overflow-y-auto">
          <button type="button" className={row} onClick={moveToNew}>
            <Plus className="size-5" aria-hidden />
            New scenario
          </button>
          {currentScenarioId !== null && (
            <button type="button" className={row} onClick={() => moveTo(null, "Inbox")}>
              <Inbox className="size-5" aria-hidden />
              Inbox
            </button>
          )}
          {scenarios.map((s) => (
            <button
              key={s.id}
              type="button"
              className={cn(row, s.id === currentScenarioId && "border-foreground")}
              disabled={s.id === currentScenarioId}
              onClick={() => moveTo(s.id, s.title)}
            >
              <span className="min-w-0 truncate">{s.title}</span>
              {s.id === currentScenarioId && (
                <span className="text-muted-foreground ml-auto text-sm">current</span>
              )}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
