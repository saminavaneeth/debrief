"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, CheckCheck, FolderInput, Loader2, Send, Sparkles } from "lucide-react";
import type { ChangeSet, GapQuestion, ProposedAction } from "@/domain";
import { applyPatch } from "@/mcp/servers/core/patch";
import { getDb } from "@/capture/db";
import { useOnline, useRun, useRuns } from "@/capture/hooks";
import { applyGapAnswer } from "@/capture/answers";
import { pushRun, saveChangeSet } from "@/capture/process";
import { moveArtifacts } from "@/capture/repo";
import { useCaptureUi } from "@/capture/ui-store";
import { Button } from "@/components/ui/button";
import { ActionCard } from "@/components/review/action-card";
import { EvidenceDrawer, type EvidenceTarget } from "@/components/review/evidence-drawer";

function ReviewList() {
  const runs = useRuns();
  if (!runs) return <p className="text-muted-foreground py-10 text-center">Loading…</p>;
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Review</h1>
        <p className="text-muted-foreground">
          Proposed changes waiting for your approval, and what was pushed.
        </p>
      </header>
      <Button asChild size="lg" className="h-14 w-full rounded-2xl text-base">
        <Link href="/process">
          <Sparkles aria-hidden />
          Process scenarios
        </Link>
      </Button>
      {runs.length === 0 ? (
        <p className="text-muted-foreground rounded-2xl border border-dashed p-6 text-center">
          Nothing to review yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {runs.map((r) => {
            const counts = r.changeSet.actions.reduce<Record<string, number>>(
              (m, a) => ({ ...m, [a.type]: (m[a.type] ?? 0) + 1 }),
              {},
            );
            return (
              <li key={r.id}>
                <Link
                  href={r.status === "in_review" ? `/review?cs=${r.id}` : `/results?cs=${r.id}`}
                  className="bg-card hover:bg-muted/50 block space-y-1 rounded-2xl border p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">
                      {r.scenarioIds.length} scenario{r.scenarioIds.length === 1 ? "" : "s"}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${r.status === "in_review" ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"}`}
                    >
                      {r.status === "in_review"
                        ? "In review"
                        : r.status === "pushed"
                          ? "Pushed"
                          : "Partly pushed"}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {Object.entries(counts)
                      .map(([k, n]) => `${n} ${k}`)
                      .join(" · ")}{" "}
                    · {r.createdAt.slice(11, 16)}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function ReviewScreen() {
  const cs = useSearchParams().get("cs");
  return cs ? <ReviewDetail id={cs} /> : <ReviewList />;
}

function ReviewDetail({ id }: { id: string }) {
  const router = useRouter();
  const online = useOnline();
  const run = useRun(id);
  const notify = useCaptureUi((s) => s.notify);
  const [evidenceTarget, setEvidenceTarget] = useState<EvidenceTarget | null>(null);
  const [pushing, setPushing] = useState(false);
  const scenarios = useLiveQuery(
    async () => (run ? (await getDb().scenarios.bulkGet(run.scenarioIds)).filter((s) => !!s) : []),
    [run?.scenarioIds.join()],
  );
  const artifacts = useLiveQuery(async () => {
    if (!run) return [];
    const ids = [...new Set(run.evidence.map((e) => e.artifactId))];
    return (await getDb().artifacts.bulkGet(ids)).filter((a) => !!a);
  }, [run?.id]);

  if (run === undefined || !scenarios || !artifacts)
    return <p className="text-muted-foreground py-10 text-center">Loading…</p>;
  if (run === null)
    return (
      <div className="space-y-4 py-10 text-center">
        <p className="text-muted-foreground">This change set is no longer on this device.</p>
        <Button asChild variant="outline" size="lg" className="h-12">
          <Link href="/review">All change sets</Link>
        </Button>
      </div>
    );
  const readOnly = run.status !== "in_review";
  const cset = run.changeSet;

  const update = (fn: (draft: ChangeSet) => void) => {
    const next = structuredClone(cset);
    fn(next);
    void saveChangeSet(run.id, next);
  };
  const setStatus = (actionId: string, status: "approved" | "proposed" | "rejected") =>
    update((d) => {
      const a = d.actions.find((x) => x.id === actionId)!;
      a.status = status;
    });
  const editField = (actionId: string, path: string, value: unknown) =>
    update((d) => {
      const a = d.actions.find((x) => x.id === actionId);
      if (a?.type !== "create") return;
      a.payload = applyPatch(a.payload, [{ op: "set", path, value }]).record;
      a.fieldSupport[path] = { source: "user", evidenceIds: [], citations: [] };
    });
  const answer = (gap: GapQuestion, value: unknown) =>
    void saveChangeSet(run.id, applyGapAnswer(cset, gap.id, value));
  const approveAll = () =>
    update((d) => {
      for (const a of d.actions) if (a.status === "proposed") a.status = "approved";
    });

  async function push() {
    setPushing(true);
    try {
      const done = await pushRun(run!.id);
      const failed = done.results?.filter((r) => r.status === "failed").length ?? 0;
      notify(
        failed ? `${failed} action(s) failed; the rest were pushed` : "Pushed to the EHS systems",
        failed ? "error" : "info",
      );
      router.push(`/results?cs=${encodeURIComponent(run!.id)}`);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Push failed", "error");
    } finally {
      setPushing(false);
    }
  }

  async function acceptMove(artifactIds: string[], toScenarioId: string) {
    await moveArtifacts(artifactIds, toScenarioId);
    notify("Moved. Process the scenario again to include it.");
    router.push(`/process?scenarios=${encodeURIComponent(toScenarioId)}&run=1`);
  }

  const pending = cset.actions.filter(
    (a) => a.status === "proposed" && a.autonomy !== "auto",
  ).length;
  const toPush = cset.actions.filter(
    (a) => a.status === "approved" || (a.status === "proposed" && a.autonomy === "auto"),
  ).length;
  const openGaps = cset.gaps.filter((g) => g.answer === undefined).length;
  // Unanswered schema-required values on actions about to be pushed: the push would fail.
  const blockers = cset.gaps.filter((g) => {
    const a = cset.actions.find((x) => x.id === g.actionId);
    const willPush =
      a?.status === "approved" || (a?.status === "proposed" && a.autonomy === "auto");
    return g.blocking && g.answer === undefined && willPush;
  });
  const showGap = (id: string) => {
    const el = document.getElementById(`gap-${id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.querySelector<HTMLElement>("select, input")?.focus({ preventScroll: true });
  };
  const resultFor = (a: ProposedAction) => run.results?.find((r) => r.actionId === a.id);

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
        <h1 className="text-2xl font-semibold tracking-tight">Proposed changes</h1>
        <p className="text-muted-foreground">
          {cset.actions.length} actions across {scenarios.length} scenario
          {scenarios.length === 1 ? "" : "s"}. Tap any field to see the evidence behind it.
        </p>
      </header>

      {cset.sortSuggestions.map((s) => (
        <div key={s.id} className="space-y-2 rounded-2xl border border-violet-300 bg-violet-50 p-4">
          <p className="flex items-start gap-2 text-[15px]">
            <FolderInput className="mt-0.5 size-4 shrink-0" aria-hidden />
            {s.rationale}
          </p>
          {s.kind === "move" && s.toScenarioId && !readOnly && (
            <Button
              size="lg"
              className="h-11"
              onClick={() => acceptMove(s.artifactIds, s.toScenarioId!)}
            >
              Move it and re-process
            </Button>
          )}
        </div>
      ))}

      {[...scenarios]
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((sc) => {
          const actions = cset.actions.filter((a) => a.scenarioId === sc.id);
          if (actions.length === 0) return null;
          return (
            <section key={sc.id} aria-labelledby={`sc-${sc.id}`} className="space-y-3">
              <h2 id={`sc-${sc.id}`} className="text-lg font-semibold">
                {sc.title}
              </h2>
              {actions.map((a) => (
                <ActionCard
                  key={a.id}
                  action={a}
                  changeSet={cset}
                  gaps={cset.gaps.filter((g) => g.actionId === a.id)}
                  readOnly={readOnly}
                  result={resultFor(a)}
                  onStatus={(s) => setStatus(a.id, s)}
                  onEdit={(path, value) => editField(a.id, path, value)}
                  onAnswer={answer}
                  onShowEvidence={setEvidenceTarget}
                />
              ))}
            </section>
          );
        })}

      {!readOnly && (
        <div className="bg-background/95 sticky bottom-20 z-10 space-y-2 rounded-2xl border p-3 shadow-lg backdrop-blur">
          <p className="text-muted-foreground text-sm">
            {pending > 0 ? `${pending} need approval` : "All approved"}
            {openGaps > 0 && ` · ${openGaps} question${openGaps === 1 ? "" : "s"} open`}
            {!online && " · offline"}
          </p>
          {blockers.length > 0 && (
            <div
              role="status"
              className="space-y-1 rounded-xl bg-amber-50 p-2 text-sm text-amber-950"
            >
              <p>Answer before pushing, or reject the action:</p>
              <ul className="space-y-1">
                {blockers.map((g) => (
                  <li key={g.id}>
                    <button
                      type="button"
                      className="min-h-8 text-left font-medium underline underline-offset-4"
                      onClick={() => showGap(g.id)}
                    >
                      {g.question}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="lg"
              className="h-12"
              onClick={approveAll}
              disabled={pending === 0}
            >
              <CheckCheck aria-hidden />
              Approve all
            </Button>
            <Button
              size="lg"
              className="h-12"
              onClick={push}
              disabled={pushing || toPush === 0 || !online || blockers.length > 0}
            >
              {pushing ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
              Push {toPush}
            </Button>
          </div>
        </div>
      )}
      {readOnly && (
        <Button asChild size="lg" className="h-12 w-full">
          <Link href={`/results?cs=${encodeURIComponent(run.id)}`}>See results</Link>
        </Button>
      )}

      <EvidenceDrawer
        target={evidenceTarget}
        evidence={run.evidence}
        artifacts={artifacts}
        knowledge={run.knowledge ?? {}}
        onOpenChange={(open) => !open && setEvidenceTarget(null)}
      />
    </div>
  );
}
