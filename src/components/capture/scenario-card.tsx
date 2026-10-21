import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Artifact, Modality, Scenario } from "@/domain";
import { cn } from "@/lib/utils";
import { areaLabel } from "@/capture/reference";
import { scenarioStats, summarizeScenario } from "@/capture/scenarios";
import { ModalityIcon } from "./modality";

export const STATUS_LABEL: Record<Scenario["status"], { label: string; tone: string }> = {
  capturing: { label: "Capturing", tone: "bg-sky-100 text-sky-900" },
  ready: { label: "Ready", tone: "bg-emerald-100 text-emerald-900" },
  processing: { label: "Processing", tone: "bg-indigo-100 text-indigo-900" },
  in_review: { label: "In review", tone: "bg-amber-100 text-amber-900" },
  pushed: { label: "Pushed", tone: "bg-zinc-200 text-zinc-800" },
};

export function StatusPill({ status }: { status: Scenario["status"] }) {
  const s = STATUS_LABEL[status];
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", s.tone)}>{s.label}</span>
  );
}

export function ScenarioCard({
  scenario,
  artifacts,
  isTarget,
}: {
  scenario: Scenario;
  artifacts: Artifact[];
  isTarget?: boolean;
}) {
  const stats = scenarioStats(artifacts);
  return (
    <Link
      href={`/scenario?id=${encodeURIComponent(scenario.id)}`}
      className={cn(
        "bg-card hover:bg-muted/50 block space-y-2 rounded-2xl border p-4 transition-colors",
        isTarget && "border-foreground",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-base leading-snug font-semibold">{scenario.title}</h3>
          <p className="text-muted-foreground truncate text-sm">
            {areaLabel(scenario.areaId) ?? "No area"}
            {stats.lastAt && ` · last ${stats.lastAt.slice(11, 16)}`}
          </p>
        </div>
        <StatusPill status={scenario.status} />
        <ChevronRight className="text-muted-foreground mt-0.5 size-5 shrink-0" aria-hidden />
      </div>
      <p className="line-clamp-2 text-[15px] leading-snug">
        {summarizeScenario(scenario, artifacts)}
      </p>
      <div className="text-muted-foreground flex items-center gap-3 text-sm">
        <span>
          {stats.count} capture{stats.count === 1 ? "" : "s"}
        </span>
        {(Object.entries(stats.byModality) as [Modality, number][]).map(([m, n]) => (
          <span key={m} className="inline-flex items-center gap-1">
            <ModalityIcon modality={m} className="size-4" />
            {n}
          </span>
        ))}
        {isTarget && (
          <span className="text-foreground ml-auto text-xs font-semibold">Capturing here</span>
        )}
      </div>
    </Link>
  );
}
