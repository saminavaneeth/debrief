import { describe, expect, it } from "vitest";
import type { Artifact } from "@/domain";
import { buildDemoDay } from "./demo-day";
import { demoFixtures } from "./demo-fixtures";
import {
  defaultScenarioTitle,
  planMerge,
  planSplit,
  scenarioStats,
  summarizeScenario,
} from "./scenarios";

const art = (id: string, scenarioId: string | null, over: Partial<Artifact> = {}): Artifact => ({
  id,
  shiftId: "SHIFT-1",
  scenarioId,
  modality: "note",
  capturedAt: "2026-10-21T09:00:00-05:00",
  capturedBy: "P-001",
  siteId: "plant-1",
  tags: [],
  ...over,
});

describe("buildDemoDay", () => {
  const day = buildDemoDay(demoFixtures());

  it("loads one shift, six scenarios and every fixture artifact", () => {
    expect(day.shift.id).toBe("SHIFT-2026-10-21");
    expect(day.scenarios.map((s) => s.id)).toEqual([
      "SCN-S1",
      "SCN-S2",
      "SCN-S3",
      "SCN-S4",
      "SCN-S5",
      "SCN-S6",
    ]);
    expect(day.artifacts).toHaveLength(14);
    expect(day.scenarios.every((s) => s.status === "ready" && s.summary)).toBe(true);
  });

  it("keeps the S6 morning note in the Inbox", () => {
    const note = day.artifacts.find((a) => a.id === "S6-A1")!;
    expect(note.scenarioId).toBeNull();
    expect(note.text).toMatch(/V-22/);
  });

  it("gives voice and video captures their transcripts as editable text", () => {
    const voice = day.artifacts.find((a) => a.id === "S1-A1")!;
    expect(voice.text).toMatch(/FL-07 was reversing/);
    expect(voice.textSource).toBe("fixture");
    expect(day.artifacts.find((a) => a.id === "S5-A1")!.text).toMatch(/not tied off/);
    expect(day.artifacts.find((a) => a.id === "S2-A3")!.textSource).toBe("fixture");
  });

  it("keeps perception fixtures for the demo engine and lists assets to cache", () => {
    expect(day.perception.map((p) => p.artifactId).sort()).toEqual(
      [
        "S1-A1",
        "S1-A2",
        "S2-A1",
        "S2-A2",
        "S3-A1",
        "S3-A2",
        "S4-A1",
        "S4-A2",
        "S4-A3",
        "S5-A1",
        "S6-A2",
      ].sort(),
    );
    expect(day.assetUrls).toContain("/demo-assets/s4/extinguisher-checklist.pdf");
    expect(day.assetUrls).toContain("/demo-assets/s5/kf-09.svg");
  });

  it("orders artifacts by capture time", () => {
    const times = day.artifacts.map((a) => a.capturedAt);
    expect([...times].sort()).toEqual(times);
  });
});

describe("scenario helpers", () => {
  const artifacts = [
    art("A1", "S", {
      modality: "photo",
      text: "Cracked mirror",
      capturedAt: "2026-10-21T08:42:00-05:00",
    }),
    art("A2", "S", {
      modality: "voice",
      text: "FL-07 nearly clipped Luis. Mirror still cracked.",
      capturedAt: "2026-10-21T08:40:00-05:00",
    }),
    art("A3", "S", { modality: "photo", capturedAt: "2026-10-21T08:45:00-05:00" }),
    art("B1", "T"),
  ];

  it("titles new scenarios by time", () => {
    expect(defaultScenarioTitle("2026-10-21T10:42:13-05:00")).toBe("New scenario 10:42");
  });

  it("counts captures by modality with first and last times", () => {
    const stats = scenarioStats(artifacts.filter((a) => a.scenarioId === "S"));
    expect(stats).toEqual({
      count: 3,
      byModality: { photo: 2, voice: 1 },
      firstAt: "2026-10-21T08:40:00-05:00",
      lastAt: "2026-10-21T08:45:00-05:00",
    });
  });

  it("summarizes from the stored summary, then the first spoken or written sentence", () => {
    expect(summarizeScenario({ summary: "Given" }, artifacts)).toBe("Given");
    expect(
      summarizeScenario(
        {},
        artifacts.filter((a) => a.scenarioId === "S"),
      ),
    ).toBe("FL-07 nearly clipped Luis.");
    expect(
      summarizeScenario({}, [art("P", "S", { modality: "photo", text: "Puddle by IM-01" })]),
    ).toBe("Puddle by IM-01");
    expect(
      summarizeScenario({}, [
        art("P", "S", { modality: "photo" }),
        art("Q", "S", { modality: "photo" }),
      ]),
    ).toBe("2 photos");
    expect(summarizeScenario({}, [])).toBe("No captures yet");
  });

  it("plans merges and splits", () => {
    expect(planMerge("S", "T", artifacts)).toEqual([
      { id: "A1", scenarioId: "T" },
      { id: "A2", scenarioId: "T" },
      { id: "A3", scenarioId: "T" },
    ]);
    expect(() => planMerge("S", "S", artifacts)).toThrow();
    expect(planSplit("S", ["A3", "B1"], artifacts, "NEW")).toEqual([
      { id: "A3", scenarioId: "NEW" },
    ]);
    expect(() => planSplit("S", [], artifacts, "NEW")).toThrow(/at least one/);
    expect(() => planSplit("S", ["A1", "A2", "A3"], artifacts, "NEW")).toThrow(
      /Leave at least one/,
    );
  });
});
