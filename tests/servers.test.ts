import { beforeEach, describe, expect, it } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ServerManifest, type EhsRecord, type ServerId } from "@/domain";
import { call, callRaw, connectClient, createTestDeps, readJsonResource } from "./helpers";

const SERVERS: ServerId[] = [
  "incidents",
  "audits",
  "meetings",
  "hazards",
  "inspections",
  "training",
];
const TOOLS = [
  "attach_evidence",
  "create_record",
  "get_record",
  "link_records",
  "search_records",
  "update_record",
  "validate_record",
];

type Write = { record: EhsRecord; replayed: boolean };

describe("every server publishes the uniform contract", () => {
  for (const id of SERVERS) {
    it(`${id}: 7 tools, manifest, schemas, picklists`, async () => {
      const { deps } = createTestDeps();
      const client = await connectClient(id, deps);

      const tools = await client.listTools();
      expect(tools.tools.map((t) => t.name).sort()).toEqual(TOOLS);

      const manifest = ServerManifest.parse(await readJsonResource(client, `ehs://${id}/manifest`));
      expect(manifest.server).toBe(id);

      const templates = await client.listResourceTemplates();
      expect(templates.resourceTemplates[0].uriTemplate).toBe(`ehs://${id}/schema/{recordType}`);

      for (const t of manifest.recordTypes) {
        const schema = await readJsonResource<{
          type: string;
          required: string[];
          properties: Record<string, unknown>;
          "x-idPrefix": string;
        }>(client, `ehs://${id}/schema/${t.recordType}`);
        expect(schema.type).toBe("object");
        expect(schema["x-idPrefix"]).toBe(t.idPrefix);
        expect(schema.properties.id).toBeUndefined(); // server-managed
        expect(schema.required).not.toContain("status"); // defaulted
        expect(schema.required).toContain("title");
      }

      const picklists = await readJsonResource<Record<string, unknown[]>>(
        client,
        `ehs://${id}/picklists`,
      );
      expect(picklists.severity).toHaveLength(5);
      for (const t of manifest.recordTypes)
        expect(picklists[`status.${t.recordType}`]).toBeDefined();
    });
  }
});

describe("incident schema carries extraction metadata", () => {
  it("publishes x-requiredWhen and x-gapQuestion", async () => {
    const { deps } = createTestDeps();
    const client = await connectClient("incidents", deps);
    const schema = await readJsonResource<{ properties: Record<string, Record<string, unknown>> }>(
      client,
      "ehs://incidents/schema/incident",
    );
    expect(schema.properties.equipmentOperatorId["x-gapQuestion"]).toBe(
      "Who was operating {{assetIds}}?",
    );
    expect(schema.properties.incidentType["x-fill"]).toMatchObject({ kind: "enumKeywords" });
  });

  it("keeps drafting metadata on child lists in their input form", async () => {
    const { deps } = createTestDeps();
    const hazards = await connectClient("hazards", deps);
    const hazard = await readJsonResource<{ properties: Record<string, Record<string, unknown>> }>(
      hazards,
      "ehs://hazards/schema/hazard",
    );
    expect(hazard.properties.correctiveActions["x-fill"]).toEqual({ kind: "guidance" });
    expect(hazard.properties.notes["x-update"]).toEqual({ kind: "note" });
    const meetings = await connectClient("meetings", deps);
    const mtg = await readJsonResource<{ properties: Record<string, Record<string, unknown>> }>(
      meetings,
      "ehs://meetings/schema/safety_meeting",
    );
    expect(mtg.properties.attendees["x-fill"]).toEqual({ kind: "roster" });
    expect(mtg.properties.actionItems["x-fill"]).toMatchObject({ kind: "actionItems" });
    const audits = await connectClient("audits", deps);
    const audit = await readJsonResource<{
      properties: { findings: { items: { properties: Record<string, Record<string, unknown>> } } };
    }>(audits, "ehs://audits/schema/audit");
    expect(audit.properties.findings.items.properties.requirementRef["x-fill"]).toEqual({
      kind: "regulation",
    });
    expect(audit.properties.findings.items.properties.severity["x-fill"]).toMatchObject({
      kind: "rule",
    });
  });
});

describe("hazards server tools", () => {
  let client: Client;
  let env: ReturnType<typeof createTestDeps>;

  beforeEach(async () => {
    env = createTestDeps();
    client = await connectClient("hazards", env.deps);
  });

  it("search_records ranks by text and applies structured filters", async () => {
    const res = await call<{ results: { id: string }[] }>(client, "search_records", {
      query: "FL-07 mirror cracked",
      status: ["open", "mitigating"],
    });
    expect(res.results[0].id).toBe("HAZ-0007");

    const dock3 = await call<{ total: number; results: { id: string }[] }>(
      client,
      "search_records",
      {
        areaId: "plant-1.dock-3",
        recordType: "hazard",
        status: "open",
      },
    );
    expect(dock3.results.map((r) => r.id).sort()).toEqual(["HAZ-0007", "HAZ-0010", "HAZ-0012"]);

    const byAsset = await call<{ results: { id: string }[] }>(client, "search_records", {
      assetId: "FL-07",
    });
    expect(byAsset.results.map((r) => r.id)).toEqual(["HAZ-0007"]);

    const recent = await call<{ results: { id: string }[] }>(client, "search_records", {
      recordType: "hazard",
      from: "2026-10-10T00:00:00-05:00",
    });
    expect(recent.results.map((r) => r.id).sort()).toEqual(["HAZ-0011", "HAZ-0012"]);
  });

  it("search_records rejects record types from other servers", async () => {
    const res = await callRaw(client, "search_records", { recordType: "incident" });
    expect(res.isError).toBe(true);
  });

  it("get_record returns own records only", async () => {
    const rec = await call<EhsRecord>(client, "get_record", { id: "HAZ-0007" });
    expect(rec.title).toBe("FL-07 right-side mirror cracked");
    expect((await callRaw(client, "get_record", { id: "INC-0001" })).isError).toBe(true);
  });

  it("create_record assigns id, defaults and child ids; replays by idempotency key", async () => {
    const args = {
      recordType: "hazard",
      idempotencyKey: "cs-1:a1",
      actor: "P-001",
      changeSetId: "cs-1",
      payload: {
        title: "IM-01 leaking onto break room floor",
        description: "Ice machine leak keeps the floor wet.",
        siteId: "plant-1",
        areaId: "plant-1.break-room",
        assetIds: ["IM-01"],
        category: "slips_trips",
        riskLevel: "medium",
        identifiedAt: "2026-10-21T10:15:00-05:00",
        source: "incident",
        correctiveActions: [
          { title: "Repair IM-01 leak", ownerRef: "role:maintenance_tech", dueInDays: 3 },
        ],
      },
    };
    const first = await call<Write>(client, "create_record", args);
    expect(first.replayed).toBe(false);
    expect(first.record).toMatchObject({
      id: "HAZ-0013",
      status: "open",
      createdBy: "P-001",
      createdAt: "2026-10-21T16:30:00-05:00",
    });
    expect(first.record.correctiveActions[0]).toMatchObject({
      id: "HAZ-0013-CA1",
      dueDate: "2026-10-24",
      status: "open",
      createdBy: "P-001",
    });
    expect(first.record.history[0]).toMatchObject({ action: "created", changeSetId: "cs-1" });

    const again = await call<Write>(client, "create_record", args);
    expect(again.replayed).toBe(true);
    expect(again.record.id).toBe("HAZ-0013");
    expect((await env.store.list({ recordType: "hazard" })).length).toBe(13);

    const reused = await callRaw(client, "create_record", {
      ...args,
      payload: { ...args.payload, title: "Different" },
    });
    expect(reused.isError).toBe(true);
    expect(JSON.stringify(reused.structuredContent)).toMatch(/already used/);
  });

  it("create_record returns field errors for schema and reference problems", async () => {
    const res = await callRaw(client, "create_record", {
      recordType: "hazard",
      idempotencyKey: "bad-1",
      payload: {
        title: "x",
        description: "y",
        siteId: "plant-1",
        areaId: "tank-farm.tank-row",
        assetIds: ["ZZ-99"],
        category: "slips_trips",
        riskLevel: "extreme",
        identifiedAt: "2026-10-21T10:15:00-05:00",
        source: "walkdown",
      },
    });
    expect(res.isError).toBe(true);
    const body = res.structuredContent as { fieldErrors: { path: string }[] };
    expect(body.fieldErrors.map((e) => e.path)).toContain("riskLevel");

    const refs = await callRaw(client, "create_record", {
      recordType: "hazard",
      idempotencyKey: "bad-2",
      payload: {
        title: "x",
        description: "y",
        siteId: "plant-1",
        areaId: "tank-farm.tank-row",
        assetIds: ["ZZ-99"],
        category: "not_a_category",
        riskLevel: "low",
        identifiedAt: "2026-10-21T10:15:00-05:00",
        source: "walkdown",
      },
    });
    const paths = (refs.structuredContent as { fieldErrors: { path: string }[] }).fieldErrors.map(
      (e) => e.path,
    );
    expect(paths).toEqual(expect.arrayContaining(["areaId", "assetIds[0]", "category"]));

    const managed = await callRaw(client, "create_record", {
      recordType: "hazard",
      idempotencyKey: "bad-3",
      payload: { id: "HAZ-9999" },
    });
    expect(JSON.stringify(managed.structuredContent)).toMatch(/server-managed/);
  });

  it("update_record patches, records history with before/after, and is idempotent", async () => {
    const args = {
      id: "HAZ-0007",
      idempotencyKey: "cs-1:a2",
      actor: "P-001",
      changeSetId: "cs-1",
      patch: [
        { op: "set", path: "riskLevel", value: "high" },
        { op: "set", path: "status", value: "mitigating" },
        {
          op: "append",
          path: "notes",
          value: { text: "Near-miss INC-0009: FL-07 nearly struck a pedestrian." },
        },
      ],
    };
    const res = await call<Write>(client, "update_record", args);
    const rec = res.record as Extract<EhsRecord, { recordType: "hazard" }>;
    expect(rec).toMatchObject({
      status: "mitigating",
      riskLevel: "high",
      updatedAt: "2026-10-21T16:30:00-05:00",
    });
    expect(rec.notes.at(-1)).toMatchObject({ by: "P-001", at: "2026-10-21T16:30:00-05:00" });
    const last = rec.history.at(-1)!;
    expect(last.action).toBe("status_changed");
    expect(last.changes).toContainEqual({ path: "riskLevel", before: "medium", after: "high" });

    const again = await call<Write>(client, "update_record", args);
    expect(again.replayed).toBe(true);
    const stored = await env.store.get("HAZ-0007");
    expect(stored!.notes).toHaveLength(2); // seed note + one appended, not two
  });

  it("update_record rejects invalid results and protected paths", async () => {
    const bad = await callRaw(client, "update_record", {
      id: "HAZ-0007",
      idempotencyKey: "u-bad",
      patch: [{ op: "set", path: "status", value: "exploded" }],
    });
    expect(bad.isError).toBe(true);
    const prot = await callRaw(client, "update_record", {
      id: "HAZ-0007",
      idempotencyKey: "u-prot",
      patch: [{ op: "set", path: "links", value: [] }],
    });
    expect(JSON.stringify(prot.structuredContent)).toMatch(/cannot be patched/);
    expect((await env.store.get("HAZ-0007"))!.status).toBe("open");
  });

  it("attach_evidence and link_records write once", async () => {
    const attach = {
      recordId: "HAZ-0007",
      artifactId: "S1-A2",
      modality: "photo",
      uri: "/demo-assets/s1/mirror.jpg",
      provenance: { type: "image_region", box: { x: 0.5, y: 0.2, w: 0.3, h: 0.3 } },
      idempotencyKey: "k1",
      actor: "P-001",
    };
    const a1 = await call<Write>(client, "attach_evidence", attach);
    expect(a1.record.evidence).toHaveLength(1);
    const a2 = await call<Write>(client, "attach_evidence", { ...attach, idempotencyKey: "k2" });
    expect(a2.record.evidence).toHaveLength(1);

    const link = {
      recordId: "HAZ-0007",
      targetId: "INC-0009",
      linkType: "relatedTo",
      idempotencyKey: "k3",
      actor: "P-001",
    };
    const l1 = await call<Write>(client, "link_records", link);
    expect(l1.record.links.map((l) => l.targetId)).toEqual(["INS-0019", "INC-0009"]);
    const l2 = await call<Write>(client, "link_records", { ...link, idempotencyKey: "k4" });
    expect(l2.record.links).toHaveLength(2);

    const selfLink = await callRaw(client, "link_records", {
      ...link,
      targetId: "HAZ-0007",
      idempotencyKey: "k5",
    });
    expect(selfLink.isError).toBe(true);
  });

  it("validate_record dry-runs without writing", async () => {
    const before = await env.store.list();
    const ok = await call<{ valid: boolean; preview: EhsRecord }>(client, "validate_record", {
      mode: "update",
      id: "HAZ-0007",
      patch: [{ op: "set", path: "riskLevel", value: "high" }],
    });
    expect(ok.valid).toBe(true);
    expect((ok.preview as { riskLevel: string }).riskLevel).toBe("high");

    const bad = await call<{ valid: boolean; errors: { path: string }[] }>(
      client,
      "validate_record",
      {
        mode: "create",
        recordType: "observation",
        payload: { title: "x" },
      },
    );
    expect(bad.valid).toBe(false);
    expect(bad.errors.length).toBeGreaterThan(0);
    expect(await env.store.list()).toEqual(before);
  });
});

describe("child collections on other servers", () => {
  it("inspections: completing items by asset id", async () => {
    const { deps } = createTestDeps();
    const client = await connectClient("inspections", deps);
    const res = await call<Write>(client, "update_record", {
      id: "INS-0021",
      idempotencyKey: "s4:a1",
      actor: "P-001",
      patch: [
        { op: "set", path: "status", value: "completed" },
        { op: "set", path: "result", value: "fail" },
        { op: "set", path: "completedAt", value: "2026-10-21T14:30:00-05:00" },
        { op: "set", path: "items[FE-115].response", value: "fail" },
        { op: "set", path: "items[FE-115].notes", value: "Gauge in red zone" },
      ],
    });
    const rec = res.record as Extract<EhsRecord, { recordType: "inspection" }>;
    expect(rec.items.find((i) => i.id === "FE-115")).toMatchObject({
      response: "fail",
      notes: "Gauge in red zone",
    });

    const link = await call<Write>(client, "link_records", {
      recordId: "INS-0021",
      itemId: "FE-115",
      targetId: "HAZ-0013",
      linkType: "resultedIn",
      idempotencyKey: "s4:a4:inverse",
    });
    expect(link.record.links[0]).toMatchObject({ itemId: "FE-115", targetId: "HAZ-0013" });
    const badItem = await callRaw(client, "link_records", {
      recordId: "INS-0021",
      itemId: "FE-999",
      targetId: "HAZ-0013",
      linkType: "resultedIn",
      idempotencyKey: "x",
    });
    expect(badItem.isError).toBe(true);
  });

  it("audits: appending a finding fills id, status and timestamps", async () => {
    const { deps } = createTestDeps();
    const client = await connectClient("audits", deps);
    const res = await call<Write>(client, "update_record", {
      id: "AUD-0004",
      idempotencyKey: "s5:a2",
      actor: "P-001",
      patch: [
        {
          op: "append",
          path: "findings",
          value: {
            title: "Worker at deck edge not tied off",
            description: "About 12 ft, east edge.",
            severity: 4,
            requirementRef: "29 CFR 1926.501(b)(1)",
            areaId: "plant-1.mezzanine",
            correctiveActions: [
              { title: "Re-brief crew on tie-off", ownerRef: "C-001", dueInDays: 1 },
            ],
          },
        },
      ],
    });
    const audit = res.record as Extract<EhsRecord, { recordType: "audit" }>;
    const f = audit.findings.at(-1)!;
    expect(f).toMatchObject({
      id: "AUD-0004-F3",
      status: "open",
      observedAt: "2026-10-21T16:30:00-05:00",
    });
    expect(f.correctiveActions[0]).toMatchObject({ id: "AUD-0004-CA2", dueDate: "2026-10-22" });
  });

  it("meetings: create with attendees and action items", async () => {
    const { deps } = createTestDeps();
    const client = await connectClient("meetings", deps);
    const res = await call<Write>(client, "create_record", {
      recordType: "safety_meeting",
      idempotencyKey: "s3:a1",
      actor: "P-001",
      payload: {
        title: "Toolbox talk: heat stress, Line B",
        description: "Signs of heat exhaustion; water, rest, shade.",
        siteId: "plant-1",
        areaId: "plant-1.assembly-b",
        meetingType: "toolbox_talk",
        topic: "Heat stress",
        heldAt: "2026-10-21T13:00:00-05:00",
        durationMinutes: 15,
        facilitatorId: "P-001",
        attendees: [{ personId: "P-006", name: "Aisha Rahman" }, { name: "T. Nguyen" }],
        actionItems: [
          { title: "Second water cooler on Line B", ownerRef: "P-006", dueDate: "2026-10-23" },
        ],
      },
    });
    const mtg = res.record as Extract<EhsRecord, { recordType: "safety_meeting" }>;
    expect(mtg).toMatchObject({ id: "MTG-0006", status: "completed" });
    expect(mtg.actionItems[0]).toMatchObject({ id: "MTG-0006-A1", status: "open" });
  });
});
