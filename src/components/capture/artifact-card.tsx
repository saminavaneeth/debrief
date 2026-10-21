"use client";

import { useState } from "react";
import { ExternalLink, FolderInput, Pencil, Square, Volume2 } from "lucide-react";
import type { Artifact } from "@/domain";
import { cn } from "@/lib/utils";
import { useMediaUrl, usePerception } from "@/capture/hooks";
import { formatDuration } from "@/capture/media";
import { areaLabel, tagName } from "@/capture/reference";
import { speak } from "@/capture/speech";
import { useCaptureUi } from "@/capture/ui-store";
import { Button } from "@/components/ui/button";
import { KeyframePlayer } from "./keyframe-player";
import { MODALITY, ModalityIcon } from "./modality";

const isDemoAsset = (a: Artifact) => !!a.media && !a.media.uri.startsWith("blob:");

function ReadAloud({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false);
  const [stopFn, setStopFn] = useState<(() => void) | null>(null);
  return (
    <Button
      variant="outline"
      size="lg"
      className="h-11"
      onClick={() => {
        if (speaking) {
          stopFn?.();
          setSpeaking(false);
          return;
        }
        setSpeaking(true);
        setStopFn(() => speak(text, () => setSpeaking(false)));
      }}
    >
      {speaking ? <Square className="fill-current" aria-hidden /> : <Volume2 aria-hidden />}
      {speaking ? "Stop" : "Play voice note"}
    </Button>
  );
}

/** The media part of a capture: image, audio, video, document or note. */
export function ArtifactPreview({ artifact }: { artifact: Artifact }) {
  const url = useMediaUrl(artifact);
  const perception = usePerception(artifact.id);
  const demo = isDemoAsset(artifact);

  switch (artifact.modality) {
    case "photo":
      return url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="bg-muted block overflow-hidden rounded-xl"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- local blobs and demo assets */}
          <img
            src={url}
            alt={artifact.text ?? "Captured photo"}
            className="max-h-72 w-full object-contain"
          />
        </a>
      ) : null;
    case "voice":
      if (demo) {
        return (
          <div className="flex flex-wrap items-center gap-3">
            {artifact.text && <ReadAloud text={artifact.text} />}
            <span className="text-muted-foreground text-sm">
              Demo voice note · {formatDuration(artifact.media?.durationMs)}
            </span>
          </div>
        );
      }
      return url ? <audio controls src={url} className="w-full" preload="metadata" /> : null;
    case "video":
      if (demo && perception?.perception.kind === "video") {
        return (
          <KeyframePlayer
            frames={perception.perception.keyframes}
            durationMs={artifact.media?.durationMs}
          />
        );
      }
      return url ? (
        <video
          controls
          playsInline
          src={url}
          className="max-h-72 w-full rounded-xl bg-black"
          preload="metadata"
        />
      ) : null;
    case "document": {
      const isImage = artifact.media?.mimeType.startsWith("image/");
      if (isImage && url) {
        return (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="bg-muted block overflow-hidden rounded-xl"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- local blobs and demo assets */}
            <img src={url} alt="Photographed document" className="max-h-72 w-full object-contain" />
          </a>
        );
      }
      return url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="hover:bg-muted flex min-h-12 items-center gap-2 rounded-xl border px-3 text-sm font-medium"
        >
          <ModalityIcon modality="document" className="size-5" />
          <span className="truncate">{artifact.media?.fileName ?? url.split("/").pop()}</span>
          <ExternalLink className="ml-auto size-4 shrink-0" aria-hidden />
        </a>
      ) : null;
    }
    case "note":
      return null;
  }
}

export function ArtifactCard({
  artifact,
  onMove,
  selectable,
  selected,
  onSelect,
}: {
  artifact: Artifact;
  onMove?: (artifact: Artifact) => void;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (id: string, selected: boolean) => void;
}) {
  const edit = useCaptureUi((s) => s.edit);
  const m = MODALITY[artifact.modality];
  const time = artifact.capturedAt.slice(11, 16);
  const showText = !!artifact.text;

  return (
    <article
      className={cn(
        "bg-card space-y-3 rounded-2xl border p-3.5",
        selected && "ring-foreground ring-2",
      )}
    >
      <header className="flex items-center gap-2">
        {selectable && (
          <input
            type="checkbox"
            checked={!!selected}
            onChange={(e) => onSelect?.(artifact.id, e.target.checked)}
            aria-label={`Select ${m.label.toLowerCase()} from ${time}`}
            className="accent-foreground size-6"
          />
        )}
        <span className="bg-muted flex size-9 items-center justify-center rounded-full">
          <ModalityIcon modality={artifact.modality} className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {m.label} · {time}
          </p>
          <p className="text-muted-foreground truncate text-xs">
            {[areaLabel(artifact.areaId), artifact.assetTag].filter(Boolean).join(" · ") ||
              "No area set"}
          </p>
        </div>
        {onMove && (
          <Button
            variant="ghost"
            size="icon-lg"
            className="size-11"
            onClick={() => onMove(artifact)}
            aria-label="Move capture"
          >
            <FolderInput aria-hidden />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-lg"
          className="size-11"
          onClick={() => edit(artifact.id)}
          aria-label="Edit capture"
        >
          <Pencil aria-hidden />
        </Button>
      </header>
      <ArtifactPreview artifact={artifact} />
      {showText && (
        <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{artifact.text}</p>
      )}
      {artifact.tags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {artifact.tags.map((t) => (
            <li key={t} className="bg-muted rounded-full px-2.5 py-1 text-xs font-medium">
              {tagName(t)}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
