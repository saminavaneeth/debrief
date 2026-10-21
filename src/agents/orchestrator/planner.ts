import type { ProposedAction, RecordRef } from "@/domain";
import type { DraftRecord, RelatedRecord, ScenarioContext } from "../types";

/**
 * Turn one scenario's drafts into ordered actions: creates, updates, links between the records
 * (and to related open records), then evidence attachments. Autonomy comes from the gateway
 * policy; the gateway enforces it again at push time.
 */
export function planScenario(
  ctx: ScenarioContext,
  drafts: DraftRecord[],
  related: RelatedRecord[],
  nextId: () => string,
): { actions: ProposedAction[]; actionIdFor: Map<string, string> } {
  const actions: ProposedAction[] = [];
  const actionIdFor = new Map<string, string>();
  const scenarioId = ctx.scenario.id;
  const policy = ctx.gateway.policy;

  const ordered = [
    ...drafts.filter((d) => d.kind === "create"),
    ...drafts.filter((d) => d.kind === "update"),
  ];
  for (const d of ordered) {
    const id = nextId();
    actionIdFor.set(d.instanceKey, id);
    const autonomy = policy.autonomyFor({
      action: d.kind,
      server: d.server,
      recordType: d.recordType,
      target: d.kind === "create" ? "new" : "existing",
    }).level;
    const common = {
      id,
      scenarioId,
      dependsOn: [],
      confidence: d.confidence,
      rationale: d.rationale,
      autonomy,
      status: "proposed" as const,
    };
    if (d.kind === "create") {
      actions.push({
        ...common,
        type: "create",
        server: d.server,
        recordType: d.recordType,
        payload: d.payload!,
        fieldSupport: d.fieldSupport,
      });
    } else {
      actions.push({
        ...common,
        type: "update",
        server: d.server,
        recordType: d.recordType,
        targetId: d.targetId as never,
        patch: d.patch!,
        before: d.before ?? {},
        fieldSupport: d.fieldSupport,
        matchScore: d.confidence,
      });
    }
  }

  const ref = (d: DraftRecord): RecordRef =>
    d.kind === "create"
      ? { actionId: actionIdFor.get(d.instanceKey)! }
      : { id: d.targetId as never };
  const link = (
    from: RecordRef,
    to: RecordRef,
    linkType: "relatedTo" | "foundDuring",
    rationale: string,
    toItemId?: string,
    server?: DraftRecord,
  ) => {
    const target = "id" in from ? "existing" : "new";
    actions.push({
      id: nextId(),
      scenarioId,
      type: "link",
      from,
      to,
      linkType,
      ...(toItemId ? { toItemId } : {}),
      dependsOn: [],
      confidence: 0.9,
      rationale,
      autonomy: policy.autonomyFor({
        action: "link",
        server: server?.server,
        recordType: server?.recordType,
        target,
      }).level,
      status: "proposed",
    });
  };

  const container = ordered.find((d) => d.manifest.linking.container);
  if (container) {
    for (const d of ordered) {
      if (d === container) continue;
      const item = d.subjectAssets.find((a) => container.itemIds.includes(a));
      link(
        ref(d),
        ref(container),
        "foundDuring",
        `Found during ${container.targetId ?? container.title}${item ? ` (item ${item})` : ""}.`,
        item,
        d,
      );
    }
  } else {
    const hub =
      ordered.find((d) => d.kind === "create" && d.manifest.matching.strategy === "event") ??
      ordered[0];
    if (hub) {
      for (const d of ordered) {
        if (d !== hub)
          link(
            ref(hub),
            ref(d),
            "relatedTo",
            `Same situation: ${hub.title} and ${d.title}.`,
            undefined,
            hub,
          );
      }
    }
  }
  const from =
    container ??
    ordered.find((d) => d.kind === "create" && d.manifest.matching.strategy === "event") ??
    ordered[0];
  if (from) {
    for (const r of related)
      link(
        ref(from),
        { id: r.id as never },
        "relatedTo",
        `${r.reason}: ${r.id} ${r.title}.`,
        undefined,
        from,
      );
  }

  // Attach media: photos and videos to every record that cites them; a document to the record
  // drafted mostly from it.
  for (const a of ctx.artifacts) {
    if (!a.media || !["photo", "video", "document"].includes(a.modality)) continue;
    const ids = new Set(ctx.evidence.filter((e) => e.artifactId === a.id).map((e) => e.id));
    const citing = ordered
      .map((d) => ({ d, n: [...d.citedEvidence].filter((id) => ids.has(id)).length }))
      .filter((x) => x.n > 0)
      .sort((x, y) => y.n - x.n);
    const targets = a.modality === "document" ? citing.slice(0, 1) : citing;
    for (const { d } of targets) {
      const to = ref(d);
      actions.push({
        id: nextId(),
        scenarioId,
        type: "attach",
        artifactId: a.id,
        to,
        dependsOn: [],
        confidence: 0.95,
        rationale: `${a.modality[0].toUpperCase()}${a.modality.slice(1)} supports ${d.kind === "create" ? "the new" : d.targetId} ${d.manifest.displayName.toLowerCase()}.`,
        autonomy: policy.autonomyFor({
          action: "attach",
          server: d.server,
          recordType: d.recordType,
          target: "id" in to ? "existing" : "new",
        }).level,
        status: "proposed",
      });
    }
  }
  return { actions, actionIdFor };
}
