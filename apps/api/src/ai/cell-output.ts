import type { ModelMessage } from "ai";
import { generateText, Output } from "ai";
import type { RunAiInput } from "../modules/run-ai/run-ai.schema";
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
import type { CellAttachmentNote } from "./cell-prompt";
import { buildCellMessages, cellOutputSchema } from "./cell-prompt";
import { gemini } from "./gemini";

// The one model call behind an AI cell. The row's audio, file and website
// cells are fetched and attached as file parts; the answer is structured
// output typed by the column (`Output.object`), free JSON for a `json`
// column (`Output.json`), and passes the same `cellValueMatchesType` check
// the spreadsheet applies on write, so a run never completes with a value
// its cell would refuse.

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

function notesOf(attachments: Attachments) {
  const notes = new Map<string, CellAttachmentNote>();
  for (const file of attachments.files) {
    notes.set(file.columnId, { kind: "attached", filename: file.filename });
  }
  for (const failure of attachments.failures) {
    notes.set(failure.columnId, { kind: "failed", error: failure.error });
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

export async function generateCellValue(
  input: RunAiInput,
): Promise<CellGeneration> {
  const attachments = await collectAttachments(input.row.cells);
  const { system, prompt } = buildCellMessages(input, notesOf(attachments));
  const messages = [userMessage(prompt, attachments)];
  const schema = cellOutputSchema(input.target.type);
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
  const output = coerceCellValue(raw, input.target.type);

  return {
    output,
    model: result.response.modelId,
    usage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      totalTokens: result.usage.totalTokens,
    },
    attachments: summariseAttachments(attachments),
  };
}
