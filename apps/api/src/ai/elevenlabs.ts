// The ElevenLabs Speech-to-Text call, and nothing else. Plain `fetch` +
// `FormData` rather than the vendor SDK: the request is one multipart POST, and
// keeping it dependency-free means the size cap, the timeout and the response
// parsing are ours (same reasoning as the fetching in cell-attachments.ts).
//
// The key is read per call and never at import time (same idiom as gemini.ts),
// so the API and the test suite boot without it; only a transcription fails.

export const ELEVENLABS_STT_URL = "https://api.elevenlabs.io/v1/speech-to-text";
/** ElevenLabs' Scribe model — the only STT model the API exposes today. */
export const ELEVENLABS_STT_MODEL = "scribe_v1";
export const ELEVENLABS_PROVIDER = "elevenlabs";
/** Long enough for a recording of a few minutes; a run must not hang on it. */
export const ELEVENLABS_TIMEOUT_MS = 120_000;

export type AudioFile = {
  filename: string;
  mediaType: string;
  data: Uint8Array;
};

export type Transcription = {
  text: string;
  languageCode: string | null;
  model: string;
  provider: string;
};

/** Minimal fetch surface, so the contract test can drive this without a key. */
export type TranscribeFetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: FormData;
    signal: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}>;

function apiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    throw new Error(
      "ELEVENLABS_API_KEY is not set. Add it to apps/api/.env (see .env.example).",
    );
  }
  return key;
}

/**
 * The response, read defensively: `text` is the contract, everything else is
 * a bonus. An answer without it is an error rather than an empty transcript,
 * so a provider change surfaces as a failure instead of a silently blank cell.
 */
function readTranscription(payload: unknown, model: string): Transcription {
  const body = (payload ?? {}) as { text?: unknown; language_code?: unknown };
  if (typeof body.text !== "string" || body.text.trim().length === 0) {
    throw new Error("ElevenLabs returned no transcript text");
  }
  return {
    text: body.text,
    languageCode:
      typeof body.language_code === "string" ? body.language_code : null,
    model,
    provider: ELEVENLABS_PROVIDER,
  };
}

/** Transcribes one audio file. Throws — the caller decides what a failure means. */
export async function transcribeAudio(
  file: AudioFile,
  fetchImpl: TranscribeFetch = fetch as unknown as TranscribeFetch,
  model: string = ELEVENLABS_STT_MODEL,
): Promise<Transcription> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([file.data], { type: file.mediaType }),
    file.filename,
  );
  form.append("model_id", model);
  const response = await fetchImpl(ELEVENLABS_STT_URL, {
    method: "POST",
    headers: { "xi-api-key": apiKey() },
    body: form,
    signal: AbortSignal.timeout(ELEVENLABS_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `ElevenLabs speech-to-text failed: HTTP ${response.status}${detail ? ` — ${detail.slice(0, 200)}` : ""}`,
    );
  }
  return readTranscription(await response.json(), model);
}
