import { z } from "zod";
import { AreaId, AssetId, IsoDate, IsoDateTime, Modality, PersonId, SiteId } from "./common";

/** One work day for one user; holds everything captured that day. */
export const Shift = z.strictObject({
  id: z.string(),
  date: IsoDate,
  userId: PersonId,
  siteId: SiteId,
  startedAt: IsoDateTime,
  endedAt: IsoDateTime.optional(),
});

export const ScenarioStatus = z.enum(["capturing", "ready", "processing", "in_review", "pushed"]);

/** One situation, e.g. "Forklift near-miss, Dock 3". Artifacts point at it via `scenarioId`. */
export const Scenario = z.strictObject({
  id: z.string(),
  shiftId: z.string(),
  title: z.string(),
  status: ScenarioStatus,
  siteId: SiteId,
  areaId: AreaId.optional(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  /** One-line summary shown on the scenario card. */
  summary: z.string().optional(),
});

export const ArtifactMedia = z.strictObject({
  mimeType: z.string(),
  /** Public path for demo assets, or an IndexedDB blob key (`blob:<id>`) for user captures. */
  uri: z.string(),
  sizeBytes: z.number().int().nonnegative().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  /** Original file name for uploaded documents. */
  fileName: z.string().optional(),
});

/** A single capture. `scenarioId: null` means it sits in the Inbox. */
export const Artifact = z.strictObject({
  id: z.string(),
  shiftId: z.string(),
  scenarioId: z.string().nullable(),
  modality: Modality,
  capturedAt: IsoDateTime,
  capturedBy: PersonId,
  siteId: SiteId,
  areaId: AreaId.optional(),
  assetTag: AssetId.optional(),
  media: ArtifactMedia.optional(),
  /** Note body, edited transcript, or user caption. */
  text: z.string().optional(),
  /** Where `text` came from: typed, live speech recognition, edited after recognition, or a demo fixture. */
  textSource: z.enum(["typed", "speech_api", "user_edit", "fixture"]).optional(),
  /** Quick-tag chips chosen from the hazard taxonomy. */
  tags: z.array(z.string()).default([]),
});

export type Shift = z.infer<typeof Shift>;
export type ScenarioStatus = z.infer<typeof ScenarioStatus>;
export type Scenario = z.infer<typeof Scenario>;
export type ArtifactMedia = z.infer<typeof ArtifactMedia>;
export type Artifact = z.infer<typeof Artifact>;
