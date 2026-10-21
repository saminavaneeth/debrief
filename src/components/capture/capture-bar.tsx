"use client";

import { useRef, useState } from "react";
import { Camera, FileText, StickyNote, Video } from "lucide-react";
import type { Shift } from "@/domain";
import { mediaMetadata, preparePhoto } from "@/capture/media";
import { addCapture } from "@/capture/repo";
import { useCaptureUi } from "@/capture/ui-store";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { VoiceRecorder } from "./voice-recorder";

type FileKind = "photo" | "video" | "document";

const INPUTS: Record<FileKind, { accept: string; capture?: "environment" }> = {
  photo: { accept: "image/*", capture: "environment" },
  video: { accept: "video/*", capture: "environment" },
  // No `capture`, so the user can pick a PDF or take a picture of a paper form.
  document: { accept: "application/pdf,image/*" },
};

/** The five capture modalities. Every capture is saved to IndexedDB the moment it exists. */
export function CaptureBar({ shift, target }: { shift: Shift; target: string | null }) {
  const inputs = {
    photo: useRef<HTMLInputElement>(null),
    video: useRef<HTMLInputElement>(null),
    document: useRef<HTMLInputElement>(null),
  };
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const edit = useCaptureUi((s) => s.edit);
  const notify = useCaptureUi((s) => s.notify);
  const where = target ? "" : " to Inbox";

  async function onFile(kind: FileKind, file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      let artifact;
      if (kind === "photo") {
        const { blob, width, height } = await preparePhoto(file);
        artifact = await addCapture(shift, {
          modality: "photo",
          scenarioId: target,
          blob,
          media: { mimeType: blob.type, width, height },
        });
      } else if (kind === "video") {
        const meta = await mediaMetadata(file, "video");
        artifact = await addCapture(shift, {
          modality: "video",
          scenarioId: target,
          blob: file,
          media: { mimeType: file.type, ...meta },
        });
      } else {
        const prepared = file.type.startsWith("image/")
          ? await preparePhoto(file)
          : { blob: file as Blob };
        artifact = await addCapture(shift, {
          modality: "document",
          scenarioId: target,
          blob: prepared.blob,
          media: { mimeType: prepared.blob.type || file.type, fileName: file.name },
        });
      }
      notify(`${kind[0].toUpperCase()}${kind.slice(1)} saved${where}`);
      edit(artifact.id);
    } catch {
      notify("Could not save the file on this device.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveNote() {
    const text = note.trim();
    if (!text) return;
    await addCapture(shift, { modality: "note", scenarioId: target, text, textSource: "typed" });
    setNote("");
    setNoteOpen(false);
    notify(`Note saved${where}`);
  }

  const tile = "h-20 flex-col gap-1 rounded-2xl text-base [&_svg:not([class*='size-'])]:size-6";

  return (
    <div className="space-y-3">
      <VoiceRecorder shift={shift} target={target} />
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          className={tile}
          disabled={busy}
          onClick={() => inputs.photo.current?.click()}
        >
          <Camera aria-hidden />
          Photo
        </Button>
        <Button
          variant="outline"
          className={tile}
          disabled={busy}
          onClick={() => inputs.video.current?.click()}
        >
          <Video aria-hidden />
          Video
        </Button>
        <Button
          variant="outline"
          className={tile}
          disabled={busy}
          onClick={() => inputs.document.current?.click()}
        >
          <FileText aria-hidden />
          Document
        </Button>
        <Button variant="outline" className={tile} onClick={() => setNoteOpen(true)}>
          <StickyNote aria-hidden />
          Note
        </Button>
      </div>
      {(Object.keys(INPUTS) as FileKind[]).map((kind) => (
        <input
          key={kind}
          ref={inputs[kind]}
          type="file"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          accept={INPUTS[kind].accept}
          {...(INPUTS[kind].capture ? { capture: INPUTS[kind].capture } : {})}
          onChange={(e) => {
            void onFile(kind, e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      ))}

      <Sheet open={noteOpen} onOpenChange={setNoteOpen}>
        <SheetContent side="bottom" className="mx-auto max-w-md rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Note</SheetTitle>
            <SheetDescription>
              Saved{target ? " to this scenario" : " to the Inbox"}.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-3 px-4 pb-6">
            <Textarea
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={5}
              placeholder="What did you see?"
              className="text-base"
            />
            <Button
              size="lg"
              className="h-12 w-full text-base"
              onClick={saveNote}
              disabled={!note.trim()}
            >
              Save note
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
