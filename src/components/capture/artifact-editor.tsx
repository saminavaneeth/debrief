"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Trash2 } from "lucide-react";
import type { Artifact } from "@/domain";
import { cn } from "@/lib/utils";
import { getDb } from "@/capture/db";
import { AREAS, ASSETS, HAZARD_TAGS, SITES } from "@/capture/reference";
import { deleteArtifact, updateArtifact } from "@/capture/repo";
import { useCaptureUi } from "@/capture/ui-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ArtifactPreview } from "./artifact-card";
import { MODALITY } from "./modality";

/** Bottom sheet for a capture's details: transcript or caption, area, asset tag, quick tags. */
export function ArtifactEditorHost() {
  const editingId = useCaptureUi((s) => s.editingId);
  const close = useCaptureUi((s) => s.closeEditor);
  const artifact = useLiveQuery(
    async () => (editingId ? ((await getDb().artifacts.get(editingId)) ?? null) : null),
    [editingId],
  );

  return (
    <Sheet open={!!editingId} onOpenChange={(open) => !open && close()}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[92dvh] max-w-md overflow-y-auto rounded-t-2xl"
      >
        {artifact ? (
          <Editor key={artifact.id} artifact={artifact} onDone={close} />
        ) : (
          <SheetTitle className="sr-only">Capture</SheetTitle>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Editor({ artifact, onDone }: { artifact: Artifact; onDone: () => void }) {
  const notify = useCaptureUi((s) => s.notify);
  const [text, setText] = useState(artifact.text ?? "");
  const [areaId, setAreaId] = useState(artifact.areaId ?? "");
  const [assetTag, setAssetTag] = useState(artifact.assetTag ?? "");
  const [tags, setTags] = useState<string[]>(artifact.tags);
  const m = MODALITY[artifact.modality];
  const assetValid = !assetTag || ASSETS.some((a) => a.id === assetTag.toUpperCase());

  async function save() {
    if (!assetValid) return;
    const textChanged = text.trim() !== (artifact.text ?? "").trim();
    await updateArtifact(artifact.id, {
      text: text.trim() || undefined,
      ...(textChanged
        ? {
            textSource:
              artifact.text && artifact.textSource !== "typed"
                ? ("user_edit" as const)
                : ("typed" as const),
          }
        : {}),
      areaId: areaId || undefined,
      assetTag: assetTag ? assetTag.toUpperCase() : undefined,
      tags,
    });
    onDone();
  }

  async function remove() {
    if (!window.confirm("Delete this capture from the device?")) return;
    await deleteArtifact(artifact.id);
    notify("Capture deleted");
    onDone();
  }

  const toggle = (id: string) =>
    setTags((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  return (
    <>
      <SheetHeader>
        <SheetTitle>{m.label} details</SheetTitle>
        <SheetDescription>Saved on this device. Add what you know now, or later.</SheetDescription>
      </SheetHeader>
      <div className="space-y-5 px-4 pb-6">
        <ArtifactPreview artifact={artifact} />

        <div className="space-y-1.5">
          <Label htmlFor="art-text">{m.textLabel}</Label>
          <Textarea
            id="art-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={artifact.modality === "voice" || artifact.modality === "note" ? 5 : 3}
            placeholder={
              artifact.modality === "voice"
                ? "No live transcript. Type what you said."
                : artifact.modality === "photo"
                  ? "Optional: what the photo shows"
                  : "Optional"
            }
            className="text-base"
          />
          {artifact.modality === "voice" && artifact.textSource === "speech_api" && (
            <p className="text-muted-foreground text-xs">
              Transcribed live. Fix any words it got wrong.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="art-area">Area</Label>
            <select
              id="art-area"
              value={areaId}
              onChange={(e) => setAreaId(e.target.value)}
              className="bg-background h-12 w-full rounded-md border px-3 text-base"
            >
              <option value="">Not set</option>
              {SITES.map((s) => (
                <optgroup key={s.id} label={s.name}>
                  {AREAS.filter((a) => a.siteId === s.id).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="art-asset">Asset tag</Label>
            <Input
              id="art-asset"
              list="asset-tags"
              value={assetTag}
              onChange={(e) => setAssetTag(e.target.value)}
              placeholder="e.g. FL-07"
              autoCapitalize="characters"
              className="h-12 text-base"
              aria-invalid={!assetValid}
            />
            <datalist id="asset-tags">
              {ASSETS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </datalist>
            {!assetValid && <p className="text-xs text-red-700">Unknown asset tag.</p>}
          </div>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Quick tags</legend>
          <div className="flex flex-wrap gap-2">
            {HAZARD_TAGS.map((t) => {
              const on = tags.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(t.id)}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-1 rounded-full border px-3.5 text-sm",
                    on
                      ? "border-foreground bg-foreground text-background"
                      : "bg-background hover:bg-muted",
                  )}
                >
                  {on && <Check className="size-3.5" aria-hidden />}
                  {t.name}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="flex gap-3">
          <Button
            variant="outline"
            size="lg"
            className="h-12"
            onClick={remove}
            aria-label="Delete capture"
          >
            <Trash2 aria-hidden />
          </Button>
          <Button size="lg" className="h-12 flex-1 text-base" onClick={save} disabled={!assetValid}>
            Done
          </Button>
        </div>
      </div>
    </>
  );
}
