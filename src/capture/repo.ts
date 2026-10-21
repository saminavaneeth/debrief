import { Artifact, type ArtifactMedia, type Modality, type Scenario, type Shift } from "@/domain";
import { localDate, localIso } from "@/lib/time";
import { getDb } from "./db";
import { buildDemoDay } from "./demo-day";
import { demoFixtures } from "./demo-fixtures";
import { releaseAllMediaUrls, releaseMediaUrl } from "./media-urls";
import { defaultScenarioTitle, planMerge, planSplit } from "./scenarios";

/** The capture app's single user until sign-in exists. */
export const CURRENT_USER = "P-001";
export const DEFAULT_SITE = "plant-1";

export const SETTINGS = {
  activeShiftId: "activeShiftId",
  /** Where new captures go: a scenario id, or null for the Inbox. */
  captureTarget: "captureTarget",
  lastAreaId: "lastAreaId",
} as const;

export function newId(prefix: string): string {
  const hex = crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  return `${prefix}-${hex}`;
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  return (await getDb().settings.get(key))?.value as T | undefined;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await getDb().settings.put({ key, value });
}

/* ------------------------------------------------------------------ shifts */

/** The active shift; creates today's shift on first use. */
export async function ensureActiveShift(): Promise<Shift> {
  const db = getDb();
  const activeId = await getSetting<string>(SETTINGS.activeShiftId);
  const active = activeId ? await db.shifts.get(activeId) : undefined;
  if (active) return active;
  return startShift();
}

export async function startShift(): Promise<Shift> {
  const db = getDb();
  const date = localDate();
  const id = `SHIFT-${date}`;
  const shift = (await db.shifts.get(id)) ?? {
    id,
    date,
    userId: CURRENT_USER,
    siteId: DEFAULT_SITE,
    startedAt: localIso(),
  };
  await db.shifts.put(shift);
  await setSetting(SETTINGS.activeShiftId, id);
  await setSetting(SETTINGS.captureTarget, null);
  return shift;
}

/* ------------------------------------------------------------------ scenarios */

export async function createScenario(
  shift: Shift,
  input: { title?: string; areaId?: string; siteId?: string } = {},
): Promise<Scenario> {
  const now = localIso();
  const scenario: Scenario = {
    id: newId("SCN"),
    shiftId: shift.id,
    title: input.title?.trim() || defaultScenarioTitle(now),
    status: "capturing",
    siteId: input.siteId ?? input.areaId?.split(".")[0] ?? shift.siteId,
    ...(input.areaId ? { areaId: input.areaId } : {}),
    createdAt: now,
    updatedAt: now,
  };
  await getDb().scenarios.add(scenario);
  return scenario;
}

export async function updateScenario(
  id: string,
  changes: Partial<Pick<Scenario, "title" | "status" | "areaId" | "siteId" | "summary">>,
) {
  await getDb().scenarios.update(id, { ...changes, updatedAt: localIso() });
}

async function touch(scenarioIds: (string | null)[]) {
  const now = localIso();
  const db = getDb();
  for (const id of new Set(scenarioIds)) if (id) await db.scenarios.update(id, { updatedAt: now });
}

export async function moveArtifacts(ids: string[], scenarioId: string | null) {
  const db = getDb();
  await db.transaction("rw", db.artifacts, db.scenarios, async () => {
    const before = await db.artifacts.bulkGet(ids);
    for (const id of ids) await db.artifacts.update(id, { scenarioId });
    await touch([scenarioId, ...before.map((a) => a?.scenarioId ?? null)]);
  });
}

export async function mergeScenarios(sourceId: string, targetId: string) {
  const db = getDb();
  await db.transaction("rw", db.artifacts, db.scenarios, async () => {
    const artifacts = await db.artifacts.where("scenarioId").equals(sourceId).toArray();
    for (const m of planMerge(sourceId, targetId, artifacts)) {
      await db.artifacts.update(m.id, { scenarioId: m.scenarioId });
    }
    await db.scenarios.delete(sourceId);
    await touch([targetId]);
  });
}

export async function splitScenario(
  sourceId: string,
  artifactIds: string[],
  title?: string,
): Promise<Scenario> {
  const db = getDb();
  const source = await db.scenarios.get(sourceId);
  if (!source) throw new Error("Scenario not found");
  const artifacts = await db.artifacts.where("scenarioId").equals(sourceId).toArray();
  const now = localIso();
  const created: Scenario = {
    id: newId("SCN"),
    shiftId: source.shiftId,
    title: title?.trim() || `${source.title} (split)`,
    status: "capturing",
    siteId: source.siteId,
    ...(source.areaId ? { areaId: source.areaId } : {}),
    createdAt: now,
    updatedAt: now,
  };
  const moves = planSplit(sourceId, artifactIds, artifacts, created.id);
  await db.transaction("rw", db.artifacts, db.scenarios, async () => {
    await db.scenarios.add(created);
    for (const m of moves) await db.artifacts.update(m.id, { scenarioId: m.scenarioId });
    await touch([sourceId]);
  });
  return created;
}

/** Delete a scenario; its captures go back to the Inbox. */
export async function deleteScenario(id: string) {
  const db = getDb();
  await db.transaction("rw", db.artifacts, db.scenarios, db.settings, async () => {
    await db.artifacts.where("scenarioId").equals(id).modify({ scenarioId: null });
    await db.scenarios.delete(id);
    if ((await getSetting(SETTINGS.captureTarget)) === id)
      await setSetting(SETTINGS.captureTarget, null);
  });
}

/* ------------------------------------------------------------------ artifacts */

export interface NewCapture {
  modality: Modality;
  scenarioId: string | null;
  blob?: Blob;
  media?: Omit<ArtifactMedia, "uri">;
  text?: string;
  textSource?: Artifact["textSource"];
  areaId?: string;
  assetTag?: string;
  tags?: string[];
}

/** Save a capture immediately (never lose it); details can be edited afterwards. */
export async function addCapture(shift: Shift, input: NewCapture): Promise<Artifact> {
  const db = getDb();
  const id = newId("ART");
  const scenario = input.scenarioId ? await db.scenarios.get(input.scenarioId) : undefined;
  const areaId =
    input.areaId ?? scenario?.areaId ?? (await getSetting<string>(SETTINGS.lastAreaId));
  const artifact = Artifact.parse({
    id,
    shiftId: shift.id,
    scenarioId: input.scenarioId,
    modality: input.modality,
    capturedAt: localIso(),
    capturedBy: CURRENT_USER,
    siteId: scenario?.siteId ?? areaId?.split(".")[0] ?? shift.siteId,
    ...(areaId ? { areaId } : {}),
    ...(input.assetTag ? { assetTag: input.assetTag } : {}),
    ...(input.blob
      ? {
          media: {
            ...input.media,
            mimeType: input.blob.type || input.media?.mimeType || "application/octet-stream",
            sizeBytes: input.blob.size,
            uri: `blob:${id}`,
          },
        }
      : {}),
    ...(input.text ? { text: input.text, textSource: input.textSource ?? "typed" } : {}),
    tags: input.tags ?? [],
  });
  await db.transaction("rw", db.artifacts, db.blobs, db.scenarios, async () => {
    await db.artifacts.add(artifact);
    if (input.blob) await db.blobs.add({ artifactId: id, blob: input.blob });
    await touch([input.scenarioId]);
  });
  void navigator.storage?.persist?.();
  return artifact;
}

export async function updateArtifact(
  id: string,
  changes: Partial<
    Pick<Artifact, "text" | "textSource" | "areaId" | "siteId" | "assetTag" | "tags">
  >,
) {
  const db = getDb();
  const current = await db.artifacts.get(id);
  if (!current) return;
  const next = { ...current, ...changes };
  for (const [k, v] of Object.entries(changes))
    if (v === undefined || v === "") delete (next as Record<string, unknown>)[k];
  if (changes.areaId) {
    next.siteId = changes.areaId.split(".")[0];
    await setSetting(SETTINGS.lastAreaId, changes.areaId);
  }
  await db.artifacts.put(Artifact.parse(next));
  await touch([current.scenarioId]);
}

export async function deleteArtifact(id: string) {
  const db = getDb();
  await db.transaction("rw", db.artifacts, db.blobs, db.perception, db.scenarios, async () => {
    const a = await db.artifacts.get(id);
    await db.artifacts.delete(id);
    await db.blobs.delete(id);
    await db.perception.delete(id);
    await touch([a?.scenarioId ?? null]);
  });
  releaseMediaUrl(id);
}

/* ------------------------------------------------------------------ demo */

/** Replace the demo shift with the S1–S6 captures and make it the active shift. */
export async function loadDemoDay(): Promise<{ shiftId: string; assetUrls: string[] }> {
  const db = getDb();
  const day = buildDemoDay(demoFixtures());
  await db.transaction(
    "rw",
    [db.shifts, db.scenarios, db.artifacts, db.blobs, db.perception, db.settings],
    async () => {
      const old = await db.artifacts.where("shiftId").equals(day.shift.id).primaryKeys();
      await db.artifacts.bulkDelete(old);
      await db.blobs.bulkDelete(old);
      await db.perception.bulkDelete(old);
      await db.scenarios.where("shiftId").equals(day.shift.id).delete();
      await db.shifts.put(day.shift);
      await db.scenarios.bulkPut(day.scenarios);
      await db.artifacts.bulkPut(day.artifacts);
      await db.perception.bulkPut(day.perception);
      await setSetting(SETTINGS.activeShiftId, day.shift.id);
      await setSetting(SETTINGS.captureTarget, null);
    },
  );
  // Warm the offline cache with the demo media (the service worker caches /demo-assets/).
  void Promise.allSettled(day.assetUrls.map((u) => fetch(u)));
  return { shiftId: day.shift.id, assetUrls: day.assetUrls };
}

/** Remove every local shift, scenario and capture on this device. */
export async function clearLocalData() {
  const db = getDb();
  await db.transaction(
    "rw",
    [
      db.shifts,
      db.scenarios,
      db.artifacts,
      db.blobs,
      db.perception,
      db.settings,
      db.queue,
      db.runs,
    ],
    async () => {
      await Promise.all([
        db.runs.clear(),
        db.shifts.clear(),
        db.scenarios.clear(),
        db.artifacts.clear(),
        db.blobs.clear(),
        db.perception.clear(),
        db.settings.clear(),
        db.queue.clear(),
      ]);
    },
  );
  releaseAllMediaUrls();
}
