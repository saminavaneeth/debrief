import { beforeEach, describe, expect, it } from "vitest";
import type { CallContext, ChangeSet, GatewayEvent, ProposedAction } from "@/domain";
import { GatewayError, orderActions } from "@/mcp/gateway";
import { createRuntime, type Runtime } from "@/mcp/runtime";
import { fixedClock } from "@/lib/time";
import { DEMO_NOW } from "./helpers";

const maria: CallContext = { actor: "P-001", roles: ["ehs_specialist"], via: "agent" };
const viewer: CallContext = { actor: "P-008", roles: ["viewer"], via: "user" };

let rt: Runtime;
let events: GatewayEvent[];

beforeEach(() => {
  rt = createRuntime({ snapshotPath: null, clock: fixedClock(DEMO_NOW) });
  events = [];
  rt.events.on((e) => {
    events.push(e);
  });
});

const common = { confidence: 0.9, rationale: "test", autonomy: "approve" as const, dependsOn: [] };

function s1ChangeSet(overrides: Partial<Record<string, Partial<ProposedAction>>> = {}): ChangeSet {
  const actions: ProposedAction[] = [
    {
      ...common,
      id: "a1",
      scenarioId: "SCN-S1",
      type: "create",
      status: "approved",
      server: "incidents",
      recordType: "incident",
      payload: {
        title: "Near miss: FL-07 reversing nearly struck pedestrian, Dock 3",
        description:
          "FL-07 reversing out of door two nearly clipped Luis Ortega in the pedestrian lane.",
        siteId: "plant-1",
        areaId: "plant-1.dock-3",
        assetIds: ["FL-07"],
        incidentType: "near_miss",
        severity: 3,
        occurredAt: "2026-10-21T08:40:00-05:00",
        involvedPeople: [
          { personId: "P-003", name: "Luis Ortega", role: "struck_or_nearly_struck" },
        ],
        immediateActions: ["FL-07 tagged out until mirror replaced"],
      },
      fieldSupport: {},
    },
    {
      ...common,
      id: "a2",
      scenarioId: "SCN-S1",
      type: "update",
      status: "approved",
      server: "hazards",
      recordType: "hazard",
      targetId: "HAZ-0007",
      patch: [
        { op: "set", path: "riskLevel", value: "high" },
        { op: "set", path: "status", value: "mitigating" },
        {
          op: "append",
          path: "notes",
          value: { text: "Near miss on 2026-10-21 involving FL-07." },
        },
      ],
      before: {},
      fieldSupport: {},
    },
    {
      ...common,
      id: "a3",
      scenarioId: "SCN-S1",
      type: "link",
      status: "approved",
      from: { actionId: "a1" },
      to: { id: "HAZ-0007" },
      linkType: "relatedTo",
    },
    {
      ...common,
      id: "a4",
      scenarioId: "SCN-S1",
      type: "attach",
      status: "proposed",
      autonomy: "auto",
      artifactId: "S1-A2",
      to: { actionId: "a1" },
    },
    {
      ...common,
      id: "a5",
      scenarioId: "SCN-S1",
      type: "attach",
      status: "proposed",
      autonomy: "auto",
      artifactId: "S1-A2",
      to: { id: "HAZ-0007" },
    },
  ];
  return {
    id: "CS-TEST-1",
    runId: "RUN-1",
    createdAt: DEMO_NOW,
    scenarioIds: ["SCN-S1"],
    status: "in_review",
    gaps: [],
    sortSuggestions: [],
    actions: actions.map((a) => ({ ...a, ...(overrides[a.id] ?? {}) }) as ProposedAction),
  };
}

const artifacts = { "S1-A2": { modality: "photo" as const, uri: "/demo-assets/s1/mirror.jpg" } };

describe("discovery", () => {
  it("finds the five enabled servers and namespaces their tools", async () => {
    const servers = await rt.gateway.discovery.servers();
    expect(servers.map((s) => s.id).sort()).toEqual([
      "audits",
      "hazards",
      "incidents",
      "inspections",
      "meetings",
    ]);
    const tools = await rt.gateway.discovery.tools();
    expect(tools).toHaveLength(35);
    expect(tools.map((t) => t.name)).toContain("incidents.create_record");
    const hazards = servers.find((s) => s.id === "hazards")!;
    expect(Object.keys(hazards.schemas).sort()).toEqual(["hazard", "observation"]);
    expect(hazards.manifest.recordTypes[0].routing.keywords.length).toBeGreaterThan(5);
  });

  it("enabling training makes it discoverable and callable without restarting", async () => {
    await expect(rt.gateway.call("training", "search_records", {}, maria)).rejects.toMatchObject({
      code: "not_enabled",
    });
    expect((await rt.gateway.discovery.servers()).map((s) => s.id)).not.toContain("training");

    rt.registry.setEnabled("training", true);
    const servers = await rt.gateway.discovery.servers();
    expect(servers.map((s) => s.id)).toContain("training");
    expect(servers.find((s) => s.id === "training")!.manifest.recordTypes[0].recordType).toBe(
      "training_assignment",
    );
    const res = await rt.gateway.call<{ total: number }>("training", "search_records", {}, maria);
    expect(res.total).toBe(0);

    rt.registry.setEnabled("training", false);
    expect((await rt.gateway.discovery.servers()).map((s) => s.id)).not.toContain("training");
  });

  it("resolves record ids to servers from manifest prefixes", async () => {
    expect(await rt.gateway.serverFor("OBS-0005")).toEqual({
      server: "hazards",
      recordType: "observation",
    });
    await expect(rt.gateway.serverFor("TRN-0001")).rejects.toBeInstanceOf(GatewayError);
  });
});

describe("policy", () => {
  it("rejects tools a role may not call, and audits the refusal", async () => {
    await expect(rt.gateway.create("hazards", "hazard", {}, viewer, "v-1")).rejects.toMatchObject({
      code: "forbidden",
    });
    const [entry] = rt.audit.list({ limit: 1 });
    expect(entry).toMatchObject({ tool: "hazards.create_record", ok: false, actor: "P-008" });
    await expect(rt.gateway.getRecord("HAZ-0007", viewer)).resolves.toMatchObject({
      id: "HAZ-0007",
    });
  });

  it("assigns autonomy levels from rules", () => {
    const p = rt.gateway.policy;
    expect(p.autonomyFor({ action: "attach", server: "hazards", target: "existing" }).level).toBe(
      "auto",
    );
    expect(
      p.autonomyFor({ action: "create", server: "incidents", recordType: "incident" }).level,
    ).toBe("approve");
    expect(p.autonomyFor({ action: "update", server: "hazards" }).level).toBe("approve");
  });
});

describe("writes", () => {
  it("dry-run validates before writing", async () => {
    const before = (await rt.store.list()).length;
    const err = await rt.gateway
      .create("hazards", "hazard", { title: "x", siteId: "plant-1" }, maria, "bad-1")
      .catch((e) => e);
    expect(err).toBeInstanceOf(GatewayError);
    expect(err.code).toBe("invalid");
    expect(err.fieldErrors.length).toBeGreaterThan(0);
    expect((await rt.store.list()).length).toBe(before);
    expect(rt.audit.list().map((e) => e.tool)).toEqual([
      "hazards.create_record",
      "hazards.validate_record",
    ]);
    expect(events).toHaveLength(0);
  });

  it("links across servers by writing each side on its own server", async () => {
    const { from, to } = await rt.gateway.link(
      { fromId: "OBS-0005", toId: "AUD-0004", linkType: "foundDuring" },
      maria,
      "link-1",
    );
    expect(from.record.links.at(-1)).toMatchObject({ type: "foundDuring", targetId: "AUD-0004" });
    expect(to.record.links.at(-1)).toMatchObject({ type: "resultedIn", targetId: "OBS-0005" });
    expect(events.map((e) => [e.type, e.recordId])).toEqual([
      ["record.linked", "OBS-0005"],
      ["record.linked", "AUD-0004"],
    ]);
  });

  it("refuses links to missing records without writing either side", async () => {
    await expect(
      rt.gateway.link(
        { fromId: "HAZ-0007", toId: "INC-0999", linkType: "relatedTo" },
        maria,
        "link-x",
      ),
    ).rejects.toMatchObject({ code: "not_found" });
    expect((await rt.store.get("HAZ-0007"))!.links).toHaveLength(1);
  });

  it("lets event handlers write through the gateway (workflow style)", async () => {
    const wf: CallContext = { actor: "workflow:wf-test", roles: ["workflow"], via: "workflow" };
    rt.events.on(async (e) => {
      if (e.type === "record.created" && e.recordType === "hazard") {
        await rt.gateway.update(
          e.recordId,
          [
            {
              op: "append",
              path: "correctiveActions",
              value: { title: "Review", ownerRef: "role:site_manager", dueInDays: 7 },
            },
          ],
          wf,
          `wf-test:${e.recordId}`,
        );
      }
    });
    const res = await rt.gateway.create(
      "hazards",
      "hazard",
      {
        title: "Test hazard",
        description: "d",
        siteId: "plant-1",
        areaId: "plant-1.dock-1",
        category: "slips_trips",
        riskLevel: "low",
        identifiedAt: DEMO_NOW,
        source: "walkdown",
      },
      maria,
      "wf-1",
    );
    const stored = await rt.store.get(res.record.id);
    expect(stored!.correctiveActions[0]).toMatchObject({
      createdBy: "workflow:wf-test",
      dueDate: "2026-10-28",
    });
    expect(events.map((e) => e.type)).toEqual(["record.created", "record.updated"]);
    expect(
      rt.audit.list().some((e) => e.via === "workflow" && e.tool === "hazards.update_record"),
    ).toBe(true);
  });
});

describe("change set execution", () => {
  it("executes in dependency order, resolving references to new records", async () => {
    const report = await rt.gateway.executeChangeSet(s1ChangeSet(), maria, { artifacts });
    expect(report.results.map((r) => [r.actionId, r.status, r.recordId])).toEqual([
      ["a1", "executed", "INC-0009"],
      ["a2", "executed", "HAZ-0007"],
      ["a3", "executed", "INC-0009"],
      ["a4", "executed", "INC-0009"],
      ["a5", "executed", "HAZ-0007"],
    ]);
    expect(report.changeSet.status).toBe("pushed");
    expect(report.changeSet.actions.find((a) => a.id === "a1")!.resultRecordId).toBe("INC-0009");

    const inc = (await rt.store.get("INC-0009"))!;
    const haz = (await rt.store.get("HAZ-0007"))!;
    expect(inc.links).toEqual([
      expect.objectContaining({ type: "relatedTo", targetId: "HAZ-0007" }),
    ]);
    expect(haz.links.map((l) => l.targetId)).toEqual(["INS-0019", "INC-0009"]);
    expect(inc.evidence.map((e) => e.artifactId)).toEqual(["S1-A2"]);
    expect(haz.evidence.map((e) => e.artifactId)).toEqual(["S1-A2"]);
    expect(inc.history[0].changeSetId).toBe("CS-TEST-1");

    const audit = rt.audit.list({ changeSetId: "CS-TEST-1" });
    expect(audit.every((e) => e.ok)).toBe(true);
    expect(audit.find((e) => e.tool === "incidents.create_record")).toMatchObject({
      idempotencyKey: "CS-TEST-1:a1",
      actionId: "a1",
      recordId: "INC-0009",
    });
    expect(events.filter((e) => e.type === "record.created").map((e) => e.recordId)).toEqual([
      "INC-0009",
    ]);
  });

  it("is safe to re-run: idempotency keys prevent duplicates and duplicate events", async () => {
    await rt.gateway.executeChangeSet(s1ChangeSet(), maria, { artifacts });
    const countBefore = (await rt.store.list()).length;
    const eventsBefore = events.length;

    // Same change set from scratch (statuses as originally proposed): every write replays.
    const again = await rt.gateway.executeChangeSet(s1ChangeSet(), maria, { artifacts });
    expect(again.results.every((r) => r.status === "executed" && r.replayed)).toBe(true);
    expect(again.results[0].recordId).toBe("INC-0009");
    expect((await rt.store.list()).length).toBe(countBefore);
    expect(events.length).toBe(eventsBefore);
    expect((await rt.store.get("HAZ-0007"))!.notes).toHaveLength(2);
  });

  it("continues independent actions after a failure, fails dependents, and retries cleanly", async () => {
    const broken = s1ChangeSet({
      a1: {
        payload: { title: "Near miss", siteId: "plant-1", incidentType: "near_miss" },
      } as never,
    });
    const first = await rt.gateway.executeChangeSet(broken, maria, { artifacts });
    const status = Object.fromEntries(first.results.map((r) => [r.actionId, r.status]));
    expect(status).toEqual({
      a1: "failed",
      a2: "executed",
      a3: "failed",
      a4: "failed",
      a5: "executed",
    });
    expect(first.results[0].fieldErrors?.length).toBeGreaterThan(0);
    expect(first.results[2].error).toMatch(/a1/);
    expect(first.changeSet.status).toBe("partially_pushed");

    // Fix the payload and retry the returned change set: only the failed actions run.
    const fixed = structuredClone(first.changeSet);
    const good = s1ChangeSet().actions[0];
    fixed.actions[0] = { ...good, status: "approved" };
    for (const a of fixed.actions) if (a.status === "failed") a.status = "approved";
    const retry = await rt.gateway.executeChangeSet(fixed, maria, { artifacts });
    expect(retry.results.map((r) => r.status)).toEqual([
      "executed",
      "executed",
      "executed",
      "executed",
      "executed",
    ]);
    expect(retry.results.find((r) => r.actionId === "a2")!.replayed).toBe(true);
    expect(retry.changeSet.status).toBe("pushed");
    expect((await rt.store.get("HAZ-0007"))!.notes).toHaveLength(2);
  });

  it("skips actions awaiting approval and anything that depends on them", async () => {
    const cs = s1ChangeSet({ a1: { status: "proposed" } });
    const report = await rt.gateway.executeChangeSet(cs, maria, { artifacts });
    const byId = Object.fromEntries(report.results.map((r) => [r.actionId, r]));
    expect(byId.a1).toMatchObject({ status: "skipped", error: "Awaiting approval" });
    expect(byId.a3).toMatchObject({ status: "skipped" });
    expect(byId.a4).toMatchObject({ status: "skipped" });
    expect(byId.a5).toMatchObject({ status: "executed" }); // auto: attach to an existing record
    expect(byId.a2).toMatchObject({ status: "executed" });
    expect(report.changeSet.actions[0].status).toBe("proposed");
    expect(report.changeSet.status).toBe("partially_pushed");
  });

  it("does not run rejected actions", async () => {
    const cs = s1ChangeSet({ a2: { status: "rejected" } });
    const report = await rt.gateway.executeChangeSet(cs, maria, { artifacts });
    expect(report.results.find((r) => r.actionId === "a2")!.status).toBe("skipped");
    expect((await rt.store.get("HAZ-0007"))!.status).toBe("open");
    expect(report.changeSet.status).toBe("pushed");
  });

  it("orders by dependencies and rejects cycles", () => {
    const cs = s1ChangeSet();
    const reversed = [...cs.actions].reverse();
    expect(orderActions(reversed).map((a) => a.id)).toEqual(["a5", "a2", "a1", "a4", "a3"]);
    const cyclic = cs.actions.map((a) => (a.id === "a1" ? { ...a, dependsOn: ["a3"] } : a));
    expect(() => orderActions(cyclic)).toThrow(/cycle/);
  });
});
