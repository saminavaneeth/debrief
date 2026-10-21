"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, CircleAlert, CircleSlash, ExternalLink, Zap } from "lucide-react";
import type {
  EhsRecord,
  WorkflowNotification,
  WorkflowRunEntry,
  WorkflowSuggestion,
} from "@/domain";

interface WorkflowActivity {
  runs: WorkflowRunEntry[];
  notifications: WorkflowNotification[];
  suggestions: WorkflowSuggestion[];
}
import { useRun } from "@/capture/hooks";
import { Button } from "@/components/ui/button";
import { refLabel } from "@/components/review/action-card";
import { LinkGraph } from "@/components/review/link-graph";

const PREFIX_SERVER: Record<string, string> = {
  INC: "incidents",
  HAZ: "hazards",
  OBS: "hazards",
  AUD: "audits",
  MTG: "meetings",
  INS: "inspections",
  TRN: "training",
};

export function ResultsScreen() {
  const id = useSearchParams().get("cs");
  const run = useRun(id);
  const [records, setRecords] = useState<EhsRecord[] | null>(null);
  const [activity, setActivity] = useState<WorkflowActivity | null>(null);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetch(`/api/platform?changeSet=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => r.json() as Promise<WorkflowActivity>)
      .then((a) => !cancelled && setActivity(a))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id, run?.results?.length]);
  const touchedIds = [
    ...new Set(
      (run?.changeSet.actions ?? [])
        .filter((a) => a.status === "executed" && a.resultRecordId)
        .flatMap((a) => [
          a.resultRecordId!,
          ...(a.type === "link" && "id" in a.to ? [a.to.id] : []),
        ]),
    ),
  ];
  const key = touchedIds.join(",");

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    fetch(`/api/agent/records?ids=${encodeURIComponent(key)}`, { cache: "no-store" })
      .then((r) => r.json() as Promise<{ records: EhsRecord[] }>)
      .then((b) => !cancelled && setRecords(b.records))
      .catch(() => !cancelled && setRecords([]));
    return () => {
      cancelled = true;
    };
  }, [key]);

  if (run === undefined) return <p className="text-muted-foreground py-10 text-center">Loading…</p>;
  if (run === null || !run.results)
    return (
      <p className="text-muted-foreground py-10 text-center">
        No push results for this change set yet.
      </p>
    );
  const cset = run.changeSet;
  const executed = run.results.filter((r) => r.status === "executed").length;

  return (
    <div className="space-y-5">
      <div className="-ml-2">
        <Button asChild variant="ghost" size="lg" className="h-11">
          <Link href="/review">
            <ArrowLeft aria-hidden />
            Review
          </Link>
        </Button>
      </div>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Results</h1>
        <p className="text-muted-foreground">
          {executed} of {run.results.length} actions done
          {run.pushedAt ? ` at ${run.pushedAt.slice(11, 16)}` : ""}.
        </p>
      </header>

      <section aria-labelledby="graph-title" className="space-y-2">
        <h2 id="graph-title" className="text-lg font-semibold">
          Linked records
        </h2>
        {records === null && key ? (
          <p className="text-muted-foreground">Loading records…</p>
        ) : (
          records && (
            <LinkGraph
              records={records}
              touched={
                new Set(
                  cset.actions
                    .filter(
                      (a) =>
                        a.status === "executed" && (a.type === "create" || a.type === "update"),
                    )
                    .map((a) => a.resultRecordId!),
                )
              }
            />
          )
        )}
      </section>

      <section aria-labelledby="wf-title" className="space-y-2">
        <h2 id="wf-title" className="text-lg font-semibold">
          Workflows
        </h2>
        {!activity ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : activity.runs.filter((r) => r.fired).length === 0 ? (
          <p className="text-muted-foreground">No workflow rule acted on these records.</p>
        ) : (
          <ul className="space-y-2">
            {activity.runs
              .filter((r) => r.fired)
              .map((r) => (
                <li key={r.id} className="bg-card rounded-xl border p-3 text-sm">
                  <p className="flex items-center gap-1.5 font-medium">
                    <Zap className="size-4 text-amber-600" aria-hidden />
                    {r.ruleName}
                  </p>
                  <p className="text-muted-foreground">
                    On {r.recordId}:{" "}
                    {r.actions
                      .filter((a) => a.ok)
                      .map(
                        (a) =>
                          `${a.type.replace("_", " ")}${a.recordId ? ` ${a.recordId}` : ""}${a.detail ? ` (${a.detail})` : ""}`,
                      )
                      .join("; ")}
                  </p>
                </li>
              ))}
          </ul>
        )}
        {activity && (activity.suggestions.length > 0 || activity.notifications.length > 0) && (
          <Link
            href="/platform?tab=activity"
            className="inline-flex min-h-11 items-center text-sm font-medium underline-offset-4 hover:underline"
          >
            {activity.suggestions.length} suggestion(s) and {activity.notifications.length}{" "}
            notification(s) in the activity feed →
          </Link>
        )}
      </section>

      <section aria-labelledby="actions-title" className="space-y-2">
        <h2 id="actions-title" className="text-lg font-semibold">
          Actions
        </h2>
        <ul className="bg-card divide-y rounded-2xl border">
          {cset.actions.map((a) => {
            const r = run.results!.find((x) => x.actionId === a.id);
            const Icon =
              r?.status === "executed"
                ? CheckCircle2
                : r?.status === "failed"
                  ? CircleAlert
                  : CircleSlash;
            const recordId = r?.recordId;
            const label =
              a.type === "create"
                ? `Created ${String(a.payload.title ?? a.recordType)}`
                : a.type === "update"
                  ? `Updated ${a.targetId}`
                  : a.type === "link"
                    ? `Linked ${refLabel(a.from, cset)} → ${refLabel(a.to, cset)}`
                    : `Attached ${a.artifactId} to ${refLabel(a.to, cset)}`;
            return (
              <li key={a.id} className="flex items-start gap-2 p-3 text-sm">
                <Icon
                  className={`mt-0.5 size-4 shrink-0 ${r?.status === "executed" ? "text-emerald-600" : r?.status === "failed" ? "text-red-600" : "text-muted-foreground"}`}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  {label}
                  {r?.error && <span className="block text-xs text-red-700">{r.error}</span>}
                </span>
                {recordId && (a.type === "create" || a.type === "update") && (
                  <Link
                    href={`/console?server=${PREFIX_SERVER[recordId.split("-")[0]]}&id=${recordId}`}
                    className="inline-flex items-center gap-1 font-mono text-xs font-semibold underline-offset-4 hover:underline"
                  >
                    {recordId}
                    <ExternalLink className="size-3" aria-hidden />
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
