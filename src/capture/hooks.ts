"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { Artifact } from "@/domain";
import { getDb } from "./db";
import { mediaUrlFor } from "./media-urls";
import { ensureActiveShift, getSetting, SETTINGS } from "./repo";

/** The active shift (created on first use). `undefined` while loading. */
export function useActiveShift() {
  // `undefined` = still loading, `null` = not set.
  const activeId = useLiveQuery(
    async () =>
      ((await getDb().settings.get(SETTINGS.activeShiftId))?.value as string | undefined) ?? null,
    [],
  );
  const shift = useLiveQuery(
    async () =>
      activeId === undefined
        ? undefined
        : activeId
          ? ((await getDb().shifts.get(activeId)) ?? null)
          : null,
    [activeId],
  );
  useEffect(() => {
    if (activeId === null || shift === null) void ensureActiveShift();
  }, [activeId, shift]);
  return shift ?? undefined;
}

export function useScenarios(shiftId: string | undefined) {
  return useLiveQuery(
    async () =>
      shiftId
        ? (await getDb().scenarios.where("shiftId").equals(shiftId).toArray()).sort((a, b) =>
            b.updatedAt.localeCompare(a.updatedAt),
          )
        : [],
    [shiftId],
  );
}

export function useScenario(id: string | null | undefined) {
  return useLiveQuery(async () => (id ? ((await getDb().scenarios.get(id)) ?? null) : null), [id]);
}

/** Artifacts of the shift, oldest first. */
export function useShiftArtifacts(shiftId: string | undefined) {
  return useLiveQuery(
    async () =>
      shiftId ? getDb().artifacts.where("shiftId").equals(shiftId).sortBy("capturedAt") : [],
    [shiftId],
  );
}

export function useScenarioArtifacts(scenarioId: string | null | undefined) {
  return useLiveQuery(
    async () =>
      scenarioId
        ? getDb().artifacts.where("scenarioId").equals(scenarioId).sortBy("capturedAt")
        : [],
    [scenarioId],
  );
}

export function useCaptureTarget() {
  return useLiveQuery(
    async () => (await getSetting<string | null>(SETTINGS.captureTarget)) ?? null,
    [],
  );
}

export function usePerception(artifactId: string) {
  return useLiveQuery(() => getDb().perception.get(artifactId), [artifactId]);
}

/** Object URL for a capture's media: the stored blob, or the demo asset path. */
export function useMediaUrl(artifact: Artifact): string | undefined {
  const uri = artifact.media?.uri;
  const isBlob = uri?.startsWith("blob:") ?? false;
  const blob = useLiveQuery(
    async () => (isBlob ? (await getDb().blobs.get(artifact.id))?.blob : undefined),
    [artifact.id, isBlob],
  );
  if (!uri) return undefined;
  if (!isBlob) return uri;
  return blob ? mediaUrlFor(artifact.id, blob) : undefined;
}

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}
