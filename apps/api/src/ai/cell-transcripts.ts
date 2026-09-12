import { describeError } from "../common/errors";
import type {
  AudioTranscriptionOutput,
  ExternalApiOutput,
} from "../modules/external-api/external-api.schema";
import {
  audioTranscriptionOutputSchema,
  EXTERNAL_API_KINDS,
} from "../modules/external-api/external-api.schema";
import type { ExternalApiService } from "../modules/external-api/external-api.service";
import { externalApiService } from "../modules/external-api/external-api.service";
import type { RunAiInputCell } from "../modules/run-ai/run-ai.schema";
import type { CellAddress } from "../modules/spreadsheet/spreadsheet.ids";
import { cellId } from "../modules/spreadsheet/spreadsheet.ids";
import type { FetchLike } from "./cell-attachments";
import { fetchAttachment, isUrlCell } from "./cell-attachments";
import type { AudioFile, Transcription } from "./elevenlabs";
import { transcribeAudio } from "./elevenlabs";

// An audio cell reaches the model as text, not as a file: before a cell runs,
// every audio cell of its row is resolved to a transcript. The upload request
// never does this — it is the worker's job, and it is cached, so a row that
// runs through five AI columns transcribes its recording once.
//
// The cache is the generic `ExternalApi` table
// (docs/features/external-api.md): the key is the *audio* cell's scoped id
// plus the file URL, the value is what ElevenLabs answered. Everything here is
// injectable (`TranscriptDeps`) so the contract test drives the whole path
// without a key or a network.
//
// Nothing throws. A recording that cannot be fetched or transcribed becomes a
// note in the prompt, exactly like an attachment that could not be fetched.

/** Column types whose file is transcribed rather than attached. */
const TRANSCRIBABLE_TYPES = new Set(["audio"]);

export function isTranscribableCell(
  cell: RunAiInputCell,
): cell is RunAiInputCell & { value: string } {
  return isUrlCell(cell, TRANSCRIBABLE_TYPES);
}

export type CellTranscript = {
  columnId: string;
  /** `ExternalApi.input`: the audio file's URL. */
  source: string;
  text: string;
  /** Whether a stored result answered it, rather than a fresh API call. */
  reused: boolean;
};

export type CellTranscriptFailure = {
  columnId: string;
  url: string;
  error: string;
};

export type Transcripts = {
  texts: CellTranscript[];
  failures: CellTranscriptFailure[];
};

/** What a completed run records about its transcripts — never the transcript. */
export type TranscriptSummary =
  | { columnId: string; source: string; characters: number; reused: boolean }
  | CellTranscriptFailure;

/** The store surface used here: one call, so a fake is one method. */
export type TranscriptStore = Pick<ExternalApiService, "resolve">;

export type TranscriptDeps = {
  store?: TranscriptStore;
  fetchImpl?: FetchLike;
  transcribe?: (file: AudioFile) => Promise<Transcription>;
};

/** A stored record is only a hit when it is a transcript of this file. */
function isTranscript(
  output: ExternalApiOutput,
): output is AudioTranscriptionOutput {
  return audioTranscriptionOutputSchema.safeParse(output).success;
}

/** Fetches the file and transcribes it, as the `ExternalApi` row to store. */
async function produceTranscript(
  cell: RunAiInputCell & { value: string },
  deps: TranscriptDeps,
): Promise<AudioTranscriptionOutput> {
  const fetched = await fetchAttachment(cell, deps.fetchImpl ?? fetch);
  if (!("data" in fetched)) throw new Error(fetched.error);
  const transcribe = deps.transcribe ?? transcribeAudio;
  const transcription = await transcribe({
    filename: fetched.filename,
    mediaType: fetched.mediaType,
    data: fetched.data,
  });
  return {
    kind: EXTERNAL_API_KINDS.audioTranscription,
    provider: transcription.provider,
    model: transcription.model,
    text: transcription.text,
    languageCode: transcription.languageCode,
    filename: fetched.filename,
    mediaType: fetched.mediaType,
    bytes: fetched.data.byteLength,
  };
}

/** One audio cell's transcript — stored or fresh — or why there is none. */
export async function resolveTranscript(
  address: CellAddress,
  cell: RunAiInputCell & { value: string },
  deps: TranscriptDeps = {},
): Promise<CellTranscript | CellTranscriptFailure> {
  const store = deps.store ?? externalApiService;
  try {
    const { record, reused } = await store.resolve(
      {
        cellId: cellId(address.sheetId, address.row, cell.index),
        input: cell.value,
      },
      () => produceTranscript(cell, deps),
      isTranscript,
    );
    const output = audioTranscriptionOutputSchema.parse(record.output);
    return {
      columnId: cell.id,
      source: record.input,
      text: output.text,
      reused,
    };
  } catch (error) {
    return {
      columnId: cell.id,
      url: cell.value,
      error: describeError(error).message,
    };
  }
}

/**
 * Every audio cell of the row, resolved in parallel, in row order. `address`
 * is the *running* cell's address — its sheet and row are the audio cells' —
 * so each transcript is keyed by the audio cell it belongs to.
 */
export async function collectTranscripts(
  address: CellAddress,
  cells: RunAiInputCell[],
  deps: TranscriptDeps = {},
): Promise<Transcripts> {
  const results = await Promise.all(
    cells
      .filter(isTranscribableCell)
      .map((cell) => resolveTranscript(address, cell, deps)),
  );
  const texts: CellTranscript[] = [];
  const failures: CellTranscriptFailure[] = [];
  for (const result of results) {
    if ("text" in result) texts.push(result);
    else failures.push(result);
  }
  return { texts, failures };
}

export function summariseTranscripts(
  transcripts: Transcripts,
): TranscriptSummary[] {
  return [
    ...transcripts.texts.map(({ columnId, source, text, reused }) => ({
      columnId,
      source,
      characters: text.length,
      reused,
    })),
    ...transcripts.failures,
  ];
}
