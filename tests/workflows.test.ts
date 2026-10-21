import { describe, expect, it } from "vitest";
import type { CallContext, EhsRecord } from "@/domain";
import { AGENT_CALL, createAgentEnv, loadFixtures, runFixture } from "@/evals/harness";
import { detectPatterns } from "@/workflows/proposals";

const fixtures = loadFixtures();
const user: CallContext = { actor: "P-001", roles: ["ehs_specialist"], via: "user" };

async function pushScenario(env: ReturnType<typeof createAgentEnv>, id: string) {
  const f = fixtures.find((x) => x.id === id)!;
  const { changeSet } = await runFixture(f, undefined, env);
  const approved = {
    ...changeSet,
    actions: changeSet.actions.map((a) => ({ ...a, status: "approved" as const })),
  };
  const artifacts = Object.fromEntries(f.artifacts.map((a) => [a.id, { modality: a.modality }]));
  const report = await env.runtime.gateway.executeChangeSet(approved, AGENT_CALL, { artifacts });
  return report.changeSet;
}

const incidentPayload = (severity: number) => ({
  title: "Hand caught in press guard",
  description: "Operator's hand caught when the guard was bypassed.",
  siteId: "plant-1",
  areaId: "plant-1.assembly-a",
  incidentType: "injury",
  severity,
  occurredAt: "2026-10-21T11:00:00-05:00",
});

describe("starter workflow rules", () => {
  it("rule 1: a severity 4+ incident notifies site managers and opens an investigation action", async () => {
    const { runtime } = createAgentEnv();
    const res = await runtime.gateway.create(
      "incidents",
      "incident",
      incidentPayload(4),
      user,
      "k1",
    );
    const inc = (await runtime.store.get(res.record.id))!;
    expect(inc.correctiveActions).toEqual([
      expect.objectContaining({
        title: "Complete investigation",
        ownerRef: "role:site_manager",
        dueDate: "2026-10-28",
        createdBy: "workflow:wf-high-severity-incident",
      }),
    ]);
    expect(runtime.feed.notifications[0]).toMatchObject({
      ruleId: "wf-high-severity-incident",
      recipients: ["P-002"],
      text: `High-severity incident ${inc.id} at Assembly Line A`,
    });
    expect(
      runtime.audit
        .list()
        .some((e) => e.via === "workflow" && e.tool === "incidents.update_record"),
    ).toBe(true);

    await runtime.gateway.create("incidents", "incident", incidentPayload(2), user, "k2");
    expect(runtime.feed.notifications).toHaveLength(1);
  });

  it("rule 2: a failed item without a hazard gets one, linked to the item, exactly once", async () => {
    const { runtime } = createAgentEnv();
    const patch = [
      { op: "set" as const, path: "items[FE-117].response", value: "fail" },
      { op: "set" as const, path: "items[FE-117].notes", value: "Pin missing" },
    ];
    await runtime.gateway.update("INS-0021", patch, user, "u1");
    const ins = (await runtime.store.get("INS-0021"))!;
    const link = ins.links.find((l) => l.itemId === "FE-117")!;
    expect(link).toMatchObject({ type: "resultedIn" });
    const haz = (await runtime.store.get(link.targetId)) as EhsRecord & { source: string };
    expect(haz).toMatchObject({
      recordType: "hazard",
      assetIds: ["FE-117"],
      source: "inspection",
      description: "Pin missing",
    });

    // Another update: the item already has a linked hazard, so no duplicate.
    await runtime.gateway.update(
      "INS-0021",
      [{ op: "set", path: "status", value: "in_progress" }],
      user,
      "u2",
    );
    const hazards = (await runtime.store.list({ recordType: "hazard" })).filter((h) =>
      h.assetIds.includes("FE-117"),
    );
    expect(hazards).toHaveLength(1);
    expect(runtime.feed.runs[0]).toMatchObject({
      ruleId: "wf-failed-inspection-item-hazard",
      fired: false,
    });
    expect(runtime.feed.runs[0].reason).toMatch(/already has a linked hazard/);
  });

  it("rule 2 does not duplicate the hazards the agent proposed in S4", async () => {
    const env = createAgentEnv();
    const cs = await pushScenario(env, "S4");
    expect(env.runtime.workflows.fired("wf-failed-inspection-item-hazard", cs.id)).toBe(false);
    const hazards = (await env.runtime.store.list({ recordType: "hazard" })).filter((h) =>
      h.assetIds.some((a) => ["FE-115", "FE-119"].includes(a)),
    );
    expect(hazards).toHaveLength(2);
  });

  it("rule 3: the S1 update is the third Dock 3 hazard activity in 30 days → one audit suggestion", async () => {
    const env = createAgentEnv();
    const cs = await pushScenario(env, "S1");
    expect(env.runtime.workflows.fired("wf-repeat-area-hazards", cs.id)).toBe(true);
    expect(env.runtime.workflows.fired("wf-high-severity-incident", cs.id)).toBe(false);
    const suggestions = env.runtime.feed.suggestions.filter(
      (s) => s.ruleId === "wf-repeat-area-hazards",
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      title: "Schedule an audit of Dock 3",
      changeSetId: cs.id,
    });
    expect(suggestions[0].recordIds.sort()).toEqual(["HAZ-0007", "HAZ-0010", "HAZ-0012"]);
  });

  it("rule 4: closing an incident suggests a toolbox talk", async () => {
    const { runtime } = createAgentEnv();
    await runtime.gateway.update(
      "INC-0007",
      [{ op: "set", path: "status", value: "closed" }],
      user,
      "c1",
    );
    expect(runtime.feed.suggestions[0]).toMatchObject({
      ruleId: "wf-closed-incident-toolbox-talk",
      recordIds: ["INC-0007"],
    });
  });

  it("disabled rules do not run", async () => {
    const { runtime } = createAgentEnv();
    runtime.workflows.setEnabled("wf-high-severity-incident", false);
    await runtime.gateway.create("incidents", "incident", incidentPayload(5), user, "k3");
    expect(runtime.feed.notifications).toHaveLength(0);
  });
});

describe("rule proposals from patterns", () => {
  it("proposes rules for a repeated asset and a hazard category after the demo pushes", async () => {
    const env = createAgentEnv();
    const { gateway, org, clock } = env.runtime;
    expect((await detectPatterns(gateway, org, clock, new Set())).map((p) => p.id)).toEqual([]);
    await pushScenario(env, "S1");
    await pushScenario(env, "S2");
    const proposals = await detectPatterns(gateway, org, clock, new Set());
    const ids = proposals.map((p) => p.id).sort();
    expect(ids).toEqual(["wf-proposed-asset-fl-07", "wf-proposed-category-slips-trips"]);
    const asset = proposals.find((p) => p.id === "wf-proposed-asset-fl-07")!;
    expect(asset.rule.enabled).toBe(false);

    // Enabling a proposal makes it a live rule.
    env.runtime.workflows.add({ ...asset.rule, enabled: true });
    const res = await gateway.create(
      "incidents",
      "incident",
      {
        ...incidentPayload(2),
        title: "FL-07 bumped a rack",
        incidentType: "property_damage",
        assetIds: ["FL-07"],
      },
      user,
      "k4",
    );
    expect(env.runtime.feed.notifications[0]).toMatchObject({
      ruleId: "wf-proposed-asset-fl-07",
      recordId: res.record.id,
    });
  });
});
