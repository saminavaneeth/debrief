import { describe, expect, it } from "vitest";
import { compareChangeSet, formatComparison } from "@/evals/compare";
import type { EhsRecord } from "@/domain";
import {
  AGENT_CALL,
  createAgentEnv,
  loadExpected,
  loadFixtures,
  runFixture,
} from "@/evals/harness";

const fixtures = loadFixtures();
const expected = loadExpected();

describe("demo engine produces the expected change sets", () => {
  for (const f of fixtures) {
    const exp = expected.find((e) => e.scenarioId === f.id)!;
    for (const variant of [undefined, ...f.variants.map((v) => v.id)]) {
      it(`${variant ?? f.id}`, async () => {
        const { changeSet } = await runFixture(f, variant);
        const c = compareChangeSet(exp, changeSet);
        expect(c.ok, formatComparison(c)).toBe(true);
      });
    }
  }
});

describe("pushing the demo day", () => {
  it("S1–S6 push through the gateway and leave linked records in the EHS systems", async () => {
    const env = createAgentEnv();
    const store = env.runtime.store;
    const created: Record<string, string[]> = {};
    for (const f of fixtures) {
      const { changeSet } = await runFixture(f, undefined, env);
      const approved = {
        ...changeSet,
        actions: changeSet.actions.map((a) => ({ ...a, status: "approved" as const })),
      };
      const artifacts = Object.fromEntries(
        f.artifacts.map((a) => [
          a.id,
          { modality: a.modality, ...(a.media ? { uri: a.media.uri } : {}) },
        ]),
      );
      const report = await env.runtime.gateway.executeChangeSet(approved, AGENT_CALL, {
        artifacts,
      });
      const failed = report.results.filter((r) => r.status !== "executed");
      expect(failed, `${f.id}: ${JSON.stringify(failed)}`).toEqual([]);
      expect(report.changeSet.status).toBe("pushed");
      created[f.id] = report.changeSet.actions
        .filter((a) => a.type === "create")
        .map((a) => a.resultRecordId!);
    }

    const get = async (id: string) => (await store.get(id)) as Record<string, unknown> & EhsRecord;
    const linksOf = (r: EhsRecord) =>
      r.links.map(
        (l) =>
          `${l.type}:${l.targetId}${l.itemId ? `@${l.itemId}` : ""}${l.targetItemId ? `>${l.targetItemId}` : ""}`,
      );

    // S1: near-miss incident ↔ HAZ-0007, hazard updated, photo on both.
    const [inc1] = created.S1;
    const haz7 = await get("HAZ-0007");
    expect(haz7).toMatchObject({ status: "mitigating", riskLevel: "high" });
    expect(linksOf(await get(inc1))).toContain("relatedTo:HAZ-0007");
    expect(linksOf(haz7)).toContain(`relatedTo:${inc1}`);
    expect(haz7.evidence.map((e) => e.artifactId)).toContain("S1-A2");
    expect((await get(inc1)).evidence.map((e) => e.artifactId)).toEqual(["S1-A2"]);

    // S2: injury incident (not recordable) ↔ new wet-floor hazard with a repair action.
    const s2 = await Promise.all(created.S2.map(get));
    const inc2 = s2.find((r) => r.recordType === "incident")!;
    const haz2 = s2.find((r) => r.recordType === "hazard")!;
    expect(inc2).toMatchObject({ incidentType: "injury", recordable: false });
    expect(linksOf(inc2)).toContain(`relatedTo:${haz2.id}`);
    expect(haz2.correctiveActions.map((c) => c.dueDate)).toContain("2026-10-24");

    // S3: meeting with 8 attendees, linked to the heat-stress hazard both ways.
    const [mtg] = created.S3;
    expect(((await get(mtg)).attendees as unknown[]).length).toBe(8);
    expect(linksOf(await get("HAZ-0011"))).toContain(`relatedTo:${mtg}`);

    // S4: inspection completed; each failed item linked to its new hazard.
    const ins = await get("INS-0021");
    expect(ins).toMatchObject({ status: "completed", result: "fail" });
    const [h115, h119] = created.S4;
    expect(linksOf(ins)).toEqual(
      expect.arrayContaining([`resultedIn:${h115}@FE-115`, `resultedIn:${h119}@FE-119`]),
    );
    expect(linksOf(await get(h115))).toContain("foundDuring:INS-0021>FE-115");

    // S5: observation found during the contractor audit, which gained a high-severity finding.
    const [obs] = created.S5;
    const aud = await get("AUD-0004");
    const finding = (
      aud.findings as { severity: number; requirementRef?: string; id: string }[]
    ).at(-1)!;
    expect(finding).toMatchObject({ id: "AUD-0004-F3", severity: 4 });
    expect(finding.requirementRef).toMatch(/1926\.501/);
    expect(linksOf(aud)).toContain(`resultedIn:${obs}`);
    expect(linksOf(await get(obs))).toContain("foundDuring:AUD-0004");

    // S6: one valve hazard.
    const s6 = await Promise.all(created.S6.map(get));
    expect(s6.map((r) => r.assetIds)).toEqual([["V-22"]]);
  });
});
