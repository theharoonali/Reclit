import { postFile } from "@/lib/api-fetch";

/**
 * `POST /assistant/transcribe` — one audio file in, its transcript out, in
 * the shape pinned by `docs/plans/030-assistant-island.md`. Mirrors
 * `lib/upload-file.ts`. Errors arrive as `ApiError` (`api-fetch.ts`): 503
 * `ASSISTANT_TRANSCRIPTION_UNAVAILABLE` when the service is not configured,
 * 502 `ASSISTANT_TRANSCRIPTION_FAILED` when it refused the audio.
 */
export type Transcription = {
  text: string;
  languageCode: string | null;
};

export const transcribeAudio = (file: File) =>
  postFile<Transcription>("/assistant/transcribe", file);
