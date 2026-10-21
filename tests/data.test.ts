import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ChecklistTemplate,
  EhsRecord,
  ExpectedChangeSet,
  HazardTaxonomy,
  KnowledgeDocMeta,
  Organization,
  RECORD_SCHEMAS,
  RECORD_TYPE_PREFIX,
  RECORD_TYPE_SERVER,
  ScenarioFixture,
  WorkflowRule,
  type Modality,
  type PerceptionFixture,
} from "@/domain";
import { dataPath, listFiles, listFilesDeep, readJson, readMarkdown } from "@/lib/data-files";

/* Validates every seed, knowledge, workflow and fixture file against the domain schemas, then
 * checks the cross-references the demo scenarios depend on. */

const rel = (file: string) => path.relative(dataPath(), file).replaceAll("\\", "/");

function parseFile<T extends z.ZodType>(schema: T, file: string): z.infer<T> {
  const result = schema.safeParse(readJson(file));
  if (!result.success) {
    throw new Error(`${rel(file)} is invalid:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/* ------------------------------------------------------------------ load everything */

const org = parseFile(Organization, dataPath("data", "seed", "org.json"));

const recordFiles = listFiles(dataPath("data", "seed", "records"), ".json");
const recordsByFile = recordFiles.map((file) => ({
  file,
  server: path.basename(file, ".json"),
  records: parseFile(z.array(EhsRecord), file),
}));
const records = recordsByFile.flatMap((f) => f.records);
const recordById = new Map(records.map((r) => [r.id, r]));

const knowledgeDocs = listFilesDeep(dataPath("data", "knowledge"), ".md").map((file) => {
  const { data, body } = readMarkdown(file);
  const result = KnowledgeDocMeta.safeParse(data);
  if (!result.success) throw new Error(`${rel(file)}: ${z.prettifyError(result.error)}`);
  return { file, meta: result.data, body };
});
const knowledgeIds = new Set(knowledgeDocs.map((d) => d.meta.id));

const taxonomy = parseFile(HazardTaxonomy, dataPath("data", "knowledge", "hazard-taxonomy.json"));
const categoryIds = new Set(taxonomy.categories.map((c) => c.id));

const templates = listFiles(dataPath("data", "knowledge", "checklists"), ".json").map((file) =>
  parseFile(ChecklistTemplate, file),
);

const rules = listFiles(dataPath("data", "workflows"), ".json").map((file) =>
  parseFile(WorkflowRule, file),
);

const fixtures = listFiles(dataPath("fixtures", "scenarios"), ".json").map((file) =>
  parseFile(ScenarioFixture, file),
);
const expectedSets = listFiles(dataPath("fixtures", "expected"), ".json").map((file) =>
  parseFile(ExpectedChangeSet, file),
);

/* ------------------------------------------------------------------ reference sets */

const siteIds = new Set(org.sites.map((s) => s.id));
const areaIds = new Set(org.sites.flatMap((s) => s.areas.map((a) => a.id)));
const assetIds = new Set(org.assets.map((a) => a.id));
const personIds = new Set(org.people.map((p) => p.id));
const roleIds = new Set(org.roles.map((r) => r.id));
const contractorIds = new Set(org.contractors.map((c) => c.id));

const DEMO_DATE = "2026-10-21";
const DEMO_START = Date.parse(`${DEMO_DATE}T00:00:00-05:00`);
const DAY_MS = 24 * 60 * 60 * 1000;

function expectUnique(ids: string[], label: string) {
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  expect(dupes, `duplicate ${label}`).toEqual([]);
}

function expectOwner(ref: string, where: string) {
  if (ref.startsWith("role:")) expect(roleIds.has(ref.slice(5)), `${where}: ${ref}`).toBe(true);
  else expect(personIds.has(ref), `${where}: ${ref}`).toBe(true);
}

/* ------------------------------------------------------------------ organization */

describe("seed: organization", () => {
  it("has unique ids", () => {
    expectUnique(
      org.sites.map((s) => s.id),
      "site ids",
    );
    expectUnique([...areaIds], "area ids");
    expectUnique(
      org.assets.map((a) => a.id),
      "asset ids",
    );
    expectUnique(
      org.people.map((p) => p.id),
      "person ids",
    );
  });

  it("assets and people reference real sites, areas, roles and contractors", () => {
    for (const a of org.assets) {
      expect(siteIds.has(a.siteId), a.id).toBe(true);
      expect(areaIds.has(a.areaId), a.id).toBe(true);
      expect(a.areaId.startsWith(`${a.siteId}.`), `${a.id} area belongs to its site`).toBe(true);
    }
    for (const p of org.people) {
      for (const role of p.roles) expect(roleIds.has(role), `${p.id} role ${role}`).toBe(true);
      if (p.homeAreaId) expect(areaIds.has(p.homeAreaId), p.id).toBe(true);
      if (p.contractorId) expect(contractorIds.has(p.contractorId), p.id).toBe(true);
    }
  });

  it("contains the assets and people the demo needs", () => {
    for (const id of ["FL-03", "FL-07", "FL-09", "IM-01", "V-20", "V-25", "FE-112", "FE-130"]) {
      expect(assetIds.has(id), id).toBe(true);
    }
    const names = org.people.map((p) => p.name);
    for (const n of ["Maria Chen", "Dev Patel", "Luis Ortega", "Jenna Brooks", "Mike Dunn"]) {
      expect(names).toContain(n);
    }
    expect(org.contractors.map((c) => c.name)).toContain("Ridgeline Steel Contractors");
  });
});

/* ------------------------------------------------------------------ records */

describe("seed: records", () => {
  it("has about 40 records with unique ids", () => {
    expect(records.length).toBeGreaterThanOrEqual(38);
    expectUnique(
      records.map((r) => r.id),
      "record ids",
    );
  });

  it("files, servers, record types and id prefixes agree", () => {
    for (const { server, records: list } of recordsByFile) {
      for (const r of list) {
        expect(r.server, r.id).toBe(server);
        expect(RECORD_TYPE_SERVER[r.recordType], r.id).toBe(server);
        expect(r.id.startsWith(`${RECORD_TYPE_PREFIX[r.recordType]}-`), r.id).toBe(true);
      }
    }
  });

  it("references real sites, areas, assets, people and contractors", () => {
    for (const r of records) {
      expect(siteIds.has(r.siteId), r.id).toBe(true);
      if (r.areaId) {
        expect(areaIds.has(r.areaId), r.id).toBe(true);
        expect(r.areaId.startsWith(`${r.siteId}.`), r.id).toBe(true);
      }
      for (const a of r.assetIds) expect(assetIds.has(a), `${r.id} asset ${a}`).toBe(true);
      if (r.reportedBy) expect(personIds.has(r.reportedBy), r.id).toBe(true);

      const people: (string | undefined)[] = [];
      const owners: string[] = r.correctiveActions.map((c) => c.ownerRef);
      switch (r.recordType) {
        case "incident":
          people.push(r.equipmentOperatorId, ...r.involvedPeople.map((p) => p.personId));
          break;
        case "observation":
          people.push(r.spokeWithId);
          if (r.contractorId) expect(contractorIds.has(r.contractorId), r.id).toBe(true);
          expect(categoryIds.has(r.category), `${r.id} category`).toBe(true);
          break;
        case "hazard":
          expect(categoryIds.has(r.category), `${r.id} category`).toBe(true);
          break;
        case "audit":
          people.push(r.leadAuditorId);
          if (r.contractorId) expect(contractorIds.has(r.contractorId), r.id).toBe(true);
          owners.push(...r.findings.flatMap((f) => f.correctiveActions.map((c) => c.ownerRef)));
          break;
        case "safety_meeting":
          people.push(r.facilitatorId, ...r.attendees.map((a) => a.personId));
          owners.push(...r.actionItems.flatMap((a) => (a.ownerRef ? [a.ownerRef] : [])));
          break;
        case "inspection":
          people.push(r.inspectorId);
          for (const item of r.items)
            if (item.assetId) expect(assetIds.has(item.assetId)).toBe(true);
          expect(
            templates.map((t) => t.id),
            r.id,
          ).toContain(r.templateId);
          break;
        case "training_assignment":
          people.push(...r.assigneeIds);
          break;
      }
      for (const p of people) if (p) expect(personIds.has(p), `${r.id} person ${p}`).toBe(true);
      for (const o of owners) expectOwner(o, r.id);
    }
  });

  it("links point at existing records and are recorded on both sides", () => {
    for (const r of records) {
      for (const link of r.links) {
        const target = recordById.get(link.targetId);
        expect(target, `${r.id} -> ${link.targetId}`).toBeDefined();
        expect(
          target!.links.some((back) => back.targetId === r.id),
          `${link.targetId} links back to ${r.id}`,
        ).toBe(true);
      }
    }
  });

  it("history is ordered and updatedAt matches the last entry", () => {
    for (const r of records) {
      expect(r.history.length, r.id).toBeGreaterThan(0);
      expect(r.history[0].action, r.id).toBe("created");
      const times = r.history.map((h) => Date.parse(h.at));
      expect(
        [...times].sort((a, b) => a - b),
        r.id,
      ).toEqual(times);
      expect(Date.parse(r.updatedAt), r.id).toBe(times[times.length - 1]);
      expect(Date.parse(r.createdAt), r.id).toBeLessThan(DEMO_START + DAY_MS);
    }
  });

  it("includes the records the demo scenarios target", () => {
    const get = (id: string) => recordById.get(id);
    expect(get("HAZ-0007")).toMatchObject({
      status: "open",
      areaId: "plant-1.dock-3",
      assetIds: ["FL-07"],
      title: "FL-07 right-side mirror cracked",
    });
    expect(get("HAZ-0011")).toMatchObject({
      status: "open",
      areaId: "plant-1.assembly-b",
      category: "heat_stress",
    });
    expect(get("AUD-0004")).toMatchObject({
      status: "in_progress",
      auditType: "contractor_safety",
      contractorId: "CTR-01",
      areaId: "plant-1.mezzanine",
    });
    const ins = get("INS-0021");
    expect(ins).toMatchObject({
      status: "scheduled",
      scheduledDate: DEMO_DATE,
      siteId: "building-a",
    });
    if (ins?.recordType !== "inspection") throw new Error("INS-0021 must be an inspection");
    expect(ins.items.map((i) => i.id)).toEqual(
      Array.from({ length: 12 }, (_, i) => `FE-${112 + i}`),
    );
    expect(ins.items.every((i) => i.response === null)).toBe(true);
  });

  it("Dock 3 has exactly two hazards active in the 30-day window, so S1 makes the third", () => {
    const windowStart = DEMO_START - 30 * DAY_MS;
    const dock3 = records.filter((r) => r.recordType === "hazard" && r.areaId === "plant-1.dock-3");
    const active = dock3.filter((r) => Date.parse(r.updatedAt) >= windowStart).map((r) => r.id);
    expect(active.sort()).toEqual(["HAZ-0010", "HAZ-0012"]);
    expect(dock3.map((r) => r.id)).toContain("HAZ-0007");
  });

  it("no other area already meets the repeat-hazard threshold", () => {
    const windowStart = DEMO_START - 30 * DAY_MS;
    const counts = new Map<string, number>();
    for (const r of records) {
      if (r.recordType !== "hazard" || !r.areaId) continue;
      if (Date.parse(r.updatedAt) < windowStart) continue;
      counts.set(r.areaId, (counts.get(r.areaId) ?? 0) + 1);
    }
    for (const [area, n] of counts) expect(n, area).toBeLessThan(3);
  });
});

/* ------------------------------------------------------------------ module JSON Schemas */

describe("record schemas", () => {
  it("convert to JSON Schema with field metadata for the orchestrator", () => {
    for (const [type, schema] of Object.entries(RECORD_SCHEMAS)) {
      const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
      expect(json.type, type).toBe("object");
    }
    const incident = z.toJSONSchema(RECORD_SCHEMAS.incident, { io: "input" }) as {
      properties: Record<string, Record<string, unknown>>;
    };
    expect(incident.properties.equipmentOperatorId["x-requiredWhen"]).toEqual([
      { field: "incidentType", op: "in", value: ["near_miss", "property_damage"] },
      { field: "assetIds", op: "notEmpty" },
    ]);
    expect(incident.properties.equipmentOperatorId["x-gapQuestion"]).toBe(
      "Who was operating {{assetIds}}?",
    );
  });
});

/* ------------------------------------------------------------------ knowledge */

describe("knowledge", () => {
  it("has the SOPs and OSHA summaries the brief lists, with unique ids", () => {
    expectUnique(
      knowledgeDocs.map((d) => d.meta.id),
      "knowledge doc ids",
    );
    for (const id of [
      "sop-forklift-pedestrian",
      "sop-fall-protection",
      "sop-heat-stress",
      "sop-extinguisher-inspection",
      "sop-spill-response",
      "sop-wet-floor-housekeeping",
      "osha-1904-7",
      "osha-1910-157",
      "osha-1910-178",
      "osha-1926-501",
      "osha-1910-28",
    ]) {
      expect(knowledgeIds.has(id), id).toBe(true);
    }
  });

  it("regulation summaries carry a CFR section and a paraphrase notice", () => {
    for (const d of knowledgeDocs.filter((doc) => doc.meta.kind === "regulation")) {
      expect(d.meta.cfr, d.meta.id).toMatch(/^29 CFR 19\d\d\.\d+$/);
      expect(d.body, d.meta.id).toContain("Paraphrased summary");
    }
  });

  it("taxonomy and templates reference existing docs and categories", () => {
    expectUnique([...categoryIds], "taxonomy categories");
    for (const c of taxonomy.categories) {
      for (const id of c.knowledgeDocIds)
        expect(knowledgeIds.has(id), `${c.id} -> ${id}`).toBe(true);
    }
    for (const t of templates) {
      for (const id of t.knowledgeDocIds)
        expect(knowledgeIds.has(id), `${t.id} -> ${id}`).toBe(true);
      for (const check of t.checks) expect(categoryIds.has(check.hazardCategory), t.id).toBe(true);
    }
    for (const d of knowledgeDocs) {
      for (const c of d.meta.categories)
        expect(categoryIds.has(c), `${d.meta.id} -> ${c}`).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ workflows */

describe("workflow rules", () => {
  it("has the four starter rules with unique ids", () => {
    expectUnique(
      rules.map((r) => r.id),
      "rule ids",
    );
    expect(rules.map((r) => r.id).sort()).toEqual([
      "wf-closed-incident-toolbox-talk",
      "wf-failed-inspection-item-hazard",
      "wf-high-severity-incident",
      "wf-repeat-area-hazards",
    ]);
  });
});

/* ------------------------------------------------------------------ scenario fixtures */

const PERCEPTION_FOR: Record<Modality, PerceptionFixture["kind"] | null> = {
  voice: "transcript",
  photo: "image",
  video: "video",
  document: "document",
  note: null,
};

describe("scenario fixtures", () => {
  it("covers S1–S6, each with two paraphrase variants", () => {
    expect(fixtures.map((f) => f.id)).toEqual(["S1", "S2", "S3", "S4", "S5", "S6"]);
    for (const f of fixtures) expect(f.variants, f.id).toHaveLength(2);
  });

  it("has globally unique scenario and artifact ids", () => {
    expectUnique(
      fixtures.flatMap((f) => f.scenarios.map((s) => s.id)),
      "scenario ids",
    );
    expectUnique(
      fixtures.flatMap((f) => f.artifacts.map((a) => a.id)),
      "artifact ids",
    );
  });

  for (const f of fixtures) {
    it(`${f.id}: artifacts, perception and variants are consistent`, () => {
      const scenarioIds = new Set(f.scenarios.map((s) => s.id));
      const artifactById = new Map(f.artifacts.map((a) => [a.id, a]));

      for (const s of f.scenarios) {
        expect(s.shiftId).toBe(f.shift.id);
        expect(siteIds.has(s.siteId), s.id).toBe(true);
        if (s.areaId) expect(areaIds.has(s.areaId), s.id).toBe(true);
      }

      for (const a of f.artifacts) {
        expect(a.shiftId, a.id).toBe(f.shift.id);
        if (a.scenarioId !== null) expect(scenarioIds.has(a.scenarioId), a.id).toBe(true);
        expect(personIds.has(a.capturedBy), a.id).toBe(true);
        expect(siteIds.has(a.siteId), a.id).toBe(true);
        if (a.areaId) expect(areaIds.has(a.areaId), a.id).toBe(true);
        if (a.assetTag) expect(assetIds.has(a.assetTag), a.id).toBe(true);
        expect(a.capturedAt.startsWith(f.shift.date), a.id).toBe(true);

        const kind = PERCEPTION_FOR[a.modality];
        if (kind === null) {
          expect(a.text, `${a.id} note has text`).toBeTruthy();
          expect(f.perception[a.id], `${a.id} note needs no perception`).toBeUndefined();
        } else {
          expect(a.media, `${a.id} has media`).toBeDefined();
          expect(f.perception[a.id]?.kind, `${a.id} perception`).toBe(kind);
        }
      }

      for (const id of Object.keys(f.perception)) expect(artifactById.has(id), id).toBe(true);

      for (const v of f.variants) {
        expect(v.id.startsWith(`${f.id}-v`), v.id).toBe(true);
        for (const [id, p] of Object.entries(v.perception)) {
          expect(f.perception[id]?.kind, `${v.id} overrides ${id}`).toBe(p.kind);
        }
        for (const id of Object.keys(v.artifactText)) {
          expect(artifactById.get(id)?.modality, `${v.id} text override ${id}`).toBe("note");
        }
        const changes = Object.keys(v.perception).length + Object.keys(v.artifactText).length;
        expect(changes, `${v.id} changes something`).toBeGreaterThan(0);
      }
    });
  }
});

/* ------------------------------------------------------------------ expected change sets */

describe("expected change sets", () => {
  it("exist for every scenario fixture", () => {
    expect(expectedSets.map((e) => e.scenarioId)).toEqual(fixtures.map((f) => f.id));
  });

  for (const e of expectedSets) {
    it(`${e.scenarioId}: references resolve`, () => {
      const fixture = fixtures.find((f) => f.id === e.scenarioId)!;
      const scenarioIds = new Set(fixture.scenarios.map((s) => s.id));
      const artifactIds = new Set(fixture.artifacts.map((a) => a.id));
      const refs = new Set(e.actions.map((a) => a.ref));
      expectUnique(
        e.actions.map((a) => a.ref),
        `${e.scenarioId} action refs`,
      );

      const checkRef = (r: { id: string } | { ref: string }, where: string) => {
        if ("id" in r) expect(recordById.has(r.id), `${where}: ${r.id}`).toBe(true);
        else expect(refs.has(r.ref), `${where}: ${r.ref}`).toBe(true);
      };

      for (const a of e.actions) {
        expect(scenarioIds.has(a.scenarioId), `${a.ref} scenario`).toBe(true);
        switch (a.type) {
          case "create":
            expect(RECORD_TYPE_SERVER[a.recordType]).toBe(a.server);
            break;
          case "update": {
            const target = recordById.get(a.targetId);
            expect(target, `${a.ref} target ${a.targetId}`).toBeDefined();
            expect(target!.recordType).toBe(a.recordType);
            expect(target!.server).toBe(a.server);
            break;
          }
          case "link":
            checkRef(a.from, `${a.ref} from`);
            checkRef(a.to, `${a.ref} to`);
            break;
          case "attach":
            expect(artifactIds.has(a.artifactId), `${a.ref} artifact`).toBe(true);
            checkRef(a.to, `${a.ref} to`);
            break;
        }
      }

      for (const g of e.gaps) expect(refs.has(g.actionRef), `gap ${g.fieldPath}`).toBe(true);
      for (const c of e.citations) {
        expect(refs.has(c.actionRef), `citation ${c.docId}`).toBe(true);
        expect(knowledgeIds.has(c.docId), `citation ${c.docId}`).toBe(true);
      }
      for (const s of e.sortSuggestions) {
        for (const id of s.artifactIds) expect(artifactIds.has(id), id).toBe(true);
        if (s.toScenarioId) expect(scenarioIds.has(s.toScenarioId)).toBe(true);
      }
      for (const w of e.workflows) expect(rules.map((r) => r.id)).toContain(w.ruleId);
    });
  }
});
