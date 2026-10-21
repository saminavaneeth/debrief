"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import type { Shift } from "@/domain";
import { cn } from "@/lib/utils";
import { formatDuration, recorderMimeType } from "@/capture/media";
import { addCapture } from "@/capture/repo";
import {
  isSpeechRecognitionSupported,
  type LiveTranscriber,
  startLiveTranscript,
} from "@/capture/speech";
import { useCaptureUi } from "@/capture/ui-store";

type State = "idle" | "starting" | "recording";

/** A press shorter than this is a tap: recording stays on until the next tap. */
const TAP_MS = 350;

/**
 * Hold to talk; release to save. A quick tap locks recording on (for gloves), and a second tap
 * stops it. The audio is always kept; the live transcript is a convenience that needs a
 * connection in Chrome and Edge.
 */
export function VoiceRecorder({ shift, target }: { shift: Shift; target: string | null }) {
  const [state, setState] = useState<State>("idle");
  const [latched, setLatched] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  const edit = useCaptureUi((s) => s.edit);
  const notify = useCaptureUi((s) => s.notify);

  const pressedAt = useRef(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const transcriber = useRef<LiveTranscriber | null>(null);
  const transcriptRef = useRef("");
  const startedAt = useRef(0);
  const stopRequested = useRef(false);

  useEffect(() => {
    if (state !== "recording") return;
    const t = setInterval(() => setElapsed(Date.now() - startedAt.current), 250);
    return () => clearInterval(t);
  }, [state]);

  useEffect(
    () => () => {
      transcriber.current?.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  async function start() {
    setWarning(null);
    setTranscript("");
    transcriptRef.current = "";
    stopRequested.current = false;
    setState("starting");
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      const mimeType = recorderMimeType();
      const rec = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => void save(rec.mimeType || mimeType || "audio/webm");
      recorder.current = rec;
      rec.start(250);
      startedAt.current = Date.now();
      setElapsed(0);
      setState("recording");
      if (isSpeechRecognitionSupported() && navigator.onLine) {
        transcriber.current = startLiveTranscript({
          onText: (text) => {
            transcriptRef.current = text;
            setTranscript(text);
          },
          onError: setWarning,
        });
      } else {
        setWarning(
          navigator.onLine
            ? "Live transcript isn't available in this browser. The recording is saved; add a summary after."
            : "Offline: no live transcript. The recording is saved; type a summary after.",
        );
      }
      // Released while the permission prompt was open.
      if (stopRequested.current) stop();
    } catch (err) {
      setState("idle");
      setLatched(false);
      const denied = err instanceof DOMException && err.name === "NotAllowedError";
      notify(
        denied
          ? "Microphone access was blocked. Allow it in the browser, or use a note."
          : "Could not start recording.",
        "error",
      );
    }
  }

  function stop() {
    if (!recorder.current || recorder.current.state === "inactive") {
      stopRequested.current = true;
      return;
    }
    transcriber.current?.stop();
    transcriber.current = null;
    recorder.current.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
    setState("idle");
    setLatched(false);
  }

  async function save(mimeType: string) {
    const durationMs = Date.now() - startedAt.current;
    const blob = new Blob(chunks.current, { type: mimeType });
    recorder.current = null;
    if (durationMs < 600 || blob.size === 0) {
      notify("Too short to save. Hold the button while you talk.");
      return;
    }
    const text = transcriptRef.current.trim();
    const artifact = await addCapture(shift, {
      modality: "voice",
      scenarioId: target,
      blob,
      media: { mimeType, durationMs },
      ...(text ? { text, textSource: "speech_api" as const } : {}),
    });
    notify(target ? "Voice note saved" : "Voice note saved to Inbox");
    edit(artifact.id);
  }

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pressedAt.current = Date.now();
    if (state !== "idle") {
      if (latched) stop();
      return;
    }
    void start();
  };

  const onPointerUp = () => {
    if (state === "idle" || latched) return;
    if (Date.now() - pressedAt.current < TAP_MS) setLatched(true);
    else stop();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== " " && e.key !== "Enter") return;
    e.preventDefault();
    if (state === "idle") {
      setLatched(true);
      void start();
    } else stop();
  };

  const active = state !== "idle";
  return (
    <div className="space-y-3">
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        onContextMenu={(e) => e.preventDefault()}
        aria-pressed={active}
        aria-label={active ? "Stop recording" : "Hold to talk, or tap to start recording"}
        className={cn(
          "flex min-h-24 w-full touch-none flex-col items-center justify-center gap-1 rounded-2xl text-lg font-semibold select-none",
          "focus-visible:ring-ring/50 focus-visible:ring-4 focus-visible:outline-none",
          active ? "bg-red-600 text-white" : "bg-foreground text-background active:scale-[0.99]",
        )}
      >
        <span className="flex items-center gap-2">
          {active ? (
            <Square className="size-6 fill-current" aria-hidden />
          ) : (
            <Mic className="size-7" aria-hidden />
          )}
          {state === "starting"
            ? "Starting…"
            : active
              ? `Recording ${formatDuration(elapsed)}`
              : "Hold to talk"}
        </span>
        <span className="text-sm font-normal opacity-80">
          {active
            ? latched
              ? "Tap to stop and save"
              : "Release to save"
            : "or tap to lock recording on"}
        </span>
      </button>
      {active && (
        <div aria-live="polite" className="bg-muted/50 min-h-16 rounded-xl border p-3 text-base">
          {transcript || <span className="text-muted-foreground">Listening…</span>}
        </div>
      )}
      {warning && <p className="text-sm text-amber-800">{warning}</p>}
    </div>
  );
}
