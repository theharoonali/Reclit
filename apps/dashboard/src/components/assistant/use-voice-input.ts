"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VOICE_MAX_BYTES, VOICE_MAX_MS } from "@/config/assistant";
import { useLatestRef } from "@/hooks/use-latest-ref";
import { ApiError } from "@/lib/api-fetch";
import type { VoiceState } from "@/lib/assistant/island-state";
import { transcribeAudio } from "@/lib/assistant/transcribe";
import type { AssistantErrorKey } from "@/lib/assistant/types";

export type VoiceInput = {
  /** False until mounted, and where the browser cannot record — hides the mic. */
  supported: boolean;
  state: VoiceState;
  errorKey: AssistantErrorKey | null;
  start: () => void;
  stop: () => void;
  /** Clears an error back to idle. */
  reset: () => void;
};

/** Opus in WebM where the browser has it (Chromium, Firefox), else MP4 (Safari). */
const MIME_TYPES = ["audio/webm;codecs=opus", "audio/mp4"];

const isSupported = () =>
  typeof window !== "undefined" &&
  "MediaRecorder" in window &&
  typeof navigator.mediaDevices?.getUserMedia === "function";

const pickMimeType = () =>
  MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));

/**
 * Records from the microphone with `MediaRecorder`, stops itself after
 * `VOICE_MAX_MS`, refuses a recording over `VOICE_MAX_BYTES`, and sends the
 * audio to `POST /assistant/transcribe`. The transcript goes to
 * `onTranscript` for the caller to put in its field — it is never sent on.
 * The microphone is released the moment the recording stops.
 */
export function useVoiceInput(
  onTranscript: (text: string) => void,
): VoiceInput {
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<VoiceState>("idle");
  const [errorKey, setErrorKey] = useState<AssistantErrorKey | null>(null);
  const onTranscriptRef = useLatestRef(onTranscript);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read after mount so the server and the first client render agree.
  useEffect(() => setSupported(isSupported()), []);

  const release = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    recorderRef.current = null;
  }, []);
  useEffect(() => release, [release]);

  const fail = useCallback(
    (key: AssistantErrorKey) => {
      release();
      setErrorKey(key);
      setState("error");
    },
    [release],
  );

  const transcribe = useCallback(
    async (blob: Blob) => {
      if (blob.size === 0) return setState("idle");
      if (blob.size > VOICE_MAX_BYTES) return fail("transcriptionFailed");
      setState("transcribing");
      const extension = blob.type.includes("mp4") ? "m4a" : "webm";
      const file = new File([blob], `recording.${extension}`, {
        type: blob.type,
      });
      try {
        const { text } = await transcribeAudio(file);
        setState("idle");
        if (text.trim()) onTranscriptRef.current(text.trim());
      } catch (error) {
        fail(
          error instanceof ApiError && error.status === 503
            ? "transcriptionUnavailable"
            : "transcriptionFailed",
        );
      }
    },
    [fail],
  );

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  const start = useCallback(async () => {
    if (recorderRef.current) return;
    setErrorKey(null);
    if (!isSupported()) return fail("micUnsupported");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return fail("micDenied");
    }
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType } : undefined,
    );
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      const type = recorder.mimeType || mimeType || "audio/webm";
      release();
      void transcribe(new Blob(chunks, { type }));
    };
    recorder.onerror = () => fail("unknown");
    streamRef.current = stream;
    recorderRef.current = recorder;
    recorder.start();
    setState("recording");
    timerRef.current = setTimeout(stop, VOICE_MAX_MS);
  }, [fail, release, stop, transcribe]);

  const reset = useCallback(() => {
    setErrorKey(null);
    setState("idle");
  }, []);

  return { supported, state, errorKey, start, stop, reset };
}
