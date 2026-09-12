import type { ModelMessage } from "ai";
import { generateText, Output } from "ai";
import type { RunAiInput } from "../modules/run-ai/run-ai.schema";
import type { CellAddress } from "../modules/spreadsheet/spreadsheet.ids";
import type {
  CellValue,
  ColumnTypeWire,
} from "../modules/spreadsheet/spreadsheet.schema";
import {
  cellValueMatchesType,
  cellValueSchema,
  isPlainObject,
} from "../modules/spreadsheet/spreadsheet.schema";
import type { AttachmentSummary, Attachments } from "./cell-attachments";
import { collectAttachments, summariseAttachments } from "./cell-attachments";
import type { CellSourceNote } from "./cell-prompt";
import { buildCellMessages, cellOutputSchema } from "./cell-prompt";
import type {
  TranscriptDeps,
  TranscriptSummary,
  Transcripts,
} from "./cell-transcripts";
import { collectTranscripts, summariseTranscripts } from "./cell-transcripts";
import { gemini } from "./gemini";

// The one model call behind an AI cell, and the typed-output call every
// generator ends on. The row's file and website cells are fetched and
// attached as file parts, its audio cells are resolved to transcripts
// (cached in `ExternalApi`) and read as text — both in parallel, before the
// prompt is built. The answer is structured output typed by the column
// (`Output.object`), free JSON for a `json` column (`Output.json`), and
// passes the same `cellValueMatchesType` check the spreadsheet applies on
// write, so a run never completes with a value its cell would refuse.

export type CellGeneration = {
  output: Exclude<CellValue, null>;
  model: string;
  usage: {
    inputTokens: number | undefined;
    outputTokens: number | undefined;
    totalTokens: number | undefined;
  };
  /** What travelled with the prompt, and what could not — never the bytes. */
  attachments: AttachmentSummary[];
  /** What was transcribed, reused or not, and what could not — never the text. */
  transcripts: TranscriptSummary[];
};

/**
 * The model's raw answer as a value the target cell would accept, or a throw
 * naming what it said instead. Shared by every generator (`generateCellValue`,
 * `generateSearchCellValue`): the check is the same `cellValueMatchesType` the
 * spreadsheet applies on any write, so a run can never complete with a value
 * its own cell would refuse.
 */
export function coerceCellValue(
  raw: unknown,
  type: ColumnTypeWire,
): Exclude<CellValue, null> {
  const parsed = cellValueSchema.safeParse(raw);
  if (!parsed.success || parsed.data === null) {
    throw new Error(
      `The model answered with something that is not a cell value: ${JSON.stringify(raw)}`,
    );
  }
  const output = parsed.data;
  const fits =
    type === "json"
      ? isPlainObject(output)
      : cellValueMatchesType(output, type);
  if (!fits) {
    throw new Error(
      `The model answered with ${JSON.stringify(output)}, which is not a ${type}`,
    );
  }
  return output;
}

function notesOf(attachments: Attachments, transcripts: Transcripts) {
  const notes = new Map<string, CellSourceNote>();
  for (const file of attachments.files) {
    notes.set(file.columnId, { kind: "attached", filename: file.filename });
  }
  for (const failure of attachments.failures) {
    notes.set(failure.columnId, {
      kind: "failed",
      step: "fetch",
      error: failure.error,
    });
  }
  for (const transcript of transcripts.texts) {
    notes.set(transcript.columnId, {
      kind: "transcribed",
      text: transcript.text,
    });
  }
  for (const failure of transcripts.failures) {
    notes.set(failure.columnId, {
      kind: "failed",
      step: "transcribe",
      error: failure.error,
    });
  }
  return notes;
}

/** The user turn: the row as text, then every fetched file. */
function userMessage(prompt: string, attachments: Attachments): ModelMessage {
  return {
    role: "user",
    content: [
      { type: "text", text: prompt },
      ...attachments.files.map((file) => ({
        type: "file" as const,
        data: file.data,
        mediaType: file.mediaType,
        filename: file.filename,
      })),
    ],
  };
}

/**
 * One model call whose answer is shaped to a column type: `Output.object`
 * with `cellOutputSchema` for a typed column, `Output.json` for a `json`
 * column (Gemini rejects open objects), then `coerceCellValue`. Both
 * generators end on it. Never give this call `tools`: Gemini refuses a JSON
 * response schema alongside a tool in one request (400 INVALID_ARGUMENT —
 * docs/plans/021-google-search-node.md), which is why a search cell grounds
 * in one call and types its answer in this one.
 */
export async function generateTypedCellValue({
  system,
  messages,
  type,
}: {
  system: string;
  messages: ModelMessage[];
  type: ColumnTypeWire;
}): Promise<Pick<CellGeneration, "output" | "model" | "usage">> {
  const schema = cellOutputSchema(type);
  const model = gemini();
  const result =
    schema === null
      ? await generateText({
          model,
          system,
          messages,
          output: Output.json(),
        })
      : await generateText({
          model,
          system,
          messages,
          output: Output.object({ schema }),
        });
  const raw =
    schema === null
      ? result.output
      : (result.output as { value: unknown }).value;
  return {
    output: coerceCellValue(raw, type),
    model: result.response.modelId,
    usage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      totalTokens: result.usage.totalTokens,
    },
  };
}

/**
 * `address` is the running cell's scoped address: its sheet and row are the
 * key the row's transcripts are cached under (cell-transcripts.ts).
 */
export async function generateCellValue(
  input: RunAiInput,
  address: CellAddress,
  transcriptDeps: TranscriptDeps = {},
): Promise<CellGeneration> {
  const [attachments, transcripts] = await Promise.all([
    collectAttachments(input.row.cells),
    collectTranscripts(address, input.row.cells, transcriptDeps),
  ]);
  const { system, prompt } = buildCellMessages(
    input,
    notesOf(attachments, transcripts),
  );
  const typed = await generateTypedCellValue({
    system,
    messages: [userMessage(prompt, attachments)],
    type: input.target.type,
  });
  return {
    ...typed,
    attachments: summariseAttachments(attachments),
    transcripts: summariseTranscripts(transcripts),
  };
}
