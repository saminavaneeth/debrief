"use client";

import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";
import { formatDuration } from "@/capture/media";

/**
 * Plays a demo video as its keyframes (demo videos ship as keyframe stills). Frames advance on
 * the keyframe timestamps; the time readout matches what the demo engine cites.
 */
export function KeyframePlayer({
  frames,
  durationMs,
}: {
  frames: { atMs: number; uri: string }[];
  durationMs?: number;
}) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const current = frames[index];
    const next = frames[index + 1];
    const wait = next
      ? next.atMs - current.atMs
      : Math.max(1500, (durationMs ?? current.atMs + 2000) - current.atMs);
    const t = setTimeout(
      () => {
        if (next) setIndex(index + 1);
        else {
          setPlaying(false);
          setIndex(0);
        }
      },
      Math.min(wait, 2500),
    );
    return () => clearTimeout(t);
  }, [playing, index, frames, durationMs]);

  const frame = frames[index];
  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-xl bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element -- local demo stills */}
        <img
          src={frame.uri}
          alt={`Video keyframe at ${formatDuration(frame.atMs)}`}
          className="aspect-video w-full object-contain"
        />
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="absolute bottom-2 left-2 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-black/70 px-3.5 text-sm font-medium text-white"
        >
          {playing ? (
            <Pause className="size-4" aria-hidden />
          ) : (
            <Play className="size-4" aria-hidden />
          )}
          {formatDuration(frame.atMs)}
          {durationMs ? ` / ${formatDuration(durationMs)}` : ""}
        </button>
      </div>
      <div className="flex gap-1.5" role="group" aria-label="Keyframes">
        {frames.map((f, i) => (
          <button
            key={f.atMs}
            type="button"
            onClick={() => {
              setPlaying(false);
              setIndex(i);
            }}
            aria-label={`Keyframe at ${formatDuration(f.atMs)}`}
            aria-current={i === index}
            className={`h-1.5 flex-1 rounded-full ${i === index ? "bg-foreground" : "bg-muted-foreground/30"}`}
          />
        ))}
      </div>
    </div>
  );
}
