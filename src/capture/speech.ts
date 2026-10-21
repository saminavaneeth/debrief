"use client";

/**
 * Thin wrapper over the Web Speech API for live transcripts while recording. Chrome and Edge send
 * audio to a recognition service, so this needs a connection; offline, the user types instead.
 */

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export const isSpeechRecognitionSupported = () => ctor() !== undefined;

export interface LiveTranscriber {
  stop(): void;
}

/**
 * Start recognition. `onText` receives the full transcript so far (final + interim) on every
 * update. Recognition restarts itself after pauses until `stop()` is called.
 */
export function startLiveTranscript(handlers: {
  onText: (text: string) => void;
  onError: (message: string) => void;
}): LiveTranscriber | null {
  const Ctor = ctor();
  if (!Ctor) return null;
  let finalText = "";
  let stopped = false;
  let rec: Recognition | null = null;

  const begin = () => {
    rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText = `${finalText} ${r[0].transcript}`.trim();
        else interim += r[0].transcript;
      }
      handlers.onText(`${finalText} ${interim}`.trim());
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      stopped = true;
      handlers.onError(
        e.error === "network"
          ? "Live transcript needs a connection. The recording is saved; type a summary instead."
          : e.error === "not-allowed"
            ? "Speech recognition was blocked. The recording is saved; type a summary instead."
            : `Speech recognition stopped (${e.error}).`,
      );
    };
    rec.onend = () => {
      if (!stopped) begin(); // browsers end recognition after a pause; keep listening
    };
    rec.start();
  };

  try {
    begin();
  } catch {
    return null;
  }
  return {
    stop: () => {
      stopped = true;
      rec?.stop();
    },
  };
}

/** Read a transcript aloud (used to "play" demo voice notes, which have no audio file). */
export function speak(text: string, onEnd?: () => void): () => void {
  if (typeof speechSynthesis === "undefined") {
    onEnd?.();
    return () => {};
  }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 1.05;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  speechSynthesis.speak(u);
  return () => speechSynthesis.cancel();
}
