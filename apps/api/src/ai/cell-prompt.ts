import { z } from "zod";
import type {
  RunAiInput,
  RunAiInputCell,
} from "../modules/run-ai/run-ai.schema";
import type {
  CellValue,
  ColumnTypeWire,
} from "../modules/spreadsheet/spreadsheet.schema";

// Pure: turns a run's input into what the model is asked, and describes the
// shape its answer must have for the target column's type. No SDK, no
// database, no network — the contract test covers this without an API key.
// The call itself (and the fetching of attachments) lives in cell-output.ts.

/** What each column type asks of the model, in words it can follow. */
const TYPE_RULES: Record<ColumnTypeWire, string> = {
  string: "a plain text string",
  formula: "a plain text string",
  number: "a single finite number (no units, no formatting)",
  boolean: "a boolean: true or false",
  date: "a date as an ISO 8601 string, e.g. 2026-09-03 or 2026-09-03T14:00:00Z",
  json: "a JSON object (keys and values; never a bare string, number or array)",
  email: "a single valid email address",
  url: "a single absolute http(s) URL",
  audio: "a single absolute http(s) URL of an audio file",
  file: "a single absolute http(s) URL of a file",
};

/**
 * The zod shape of the model's structured answer for a column type, wrapped
 * as `{ value }` because structured output wants an object at the root.
 * `null` for `json`: Gemini rejects open objects (`additionalProperties`), so
 * a JSON column is asked for free JSON instead and validated afterwards.
 */
export function cellOutputSchema(
  type: ColumnTypeWire,
): z.ZodType<{ value: Exclude<CellValue, null> }> | null {
  switch (type) {
    case "number":
      return z.object({ value: z.number().describe(TYPE_RULES.number) });
    case "boolean":
      return z.object({ value: z.boolean().describe(TYPE_RULES.boolean) });
    case "json":
      return null;
    default:
      return z.object({ value: z.string().describe(TYPE_RULES[type]) });
  }
}

/**
 * How a URL cell reached the model: as an attached file (named so the line
 * can point at it) or not at all (with the reason), keyed by column id.
 */
export type CellAttachmentNote =
  | { kind: "attached"; filename: string }
  | { kind: "failed"; error: string };
export type CellAttachmentNotes = ReadonlyMap<string, CellAttachmentNote>;

/**
 * One cell as a prompt line: `Name (type): value`; blanks say so, JSON is
 * stringified, and a cell whose file travels alongside names the file.
 */
export function formatCellLine(
  cell: RunAiInputCell,
  note?: CellAttachmentNote,
): string {
  const value =
    note?.kind === "attached"
      ? `attached file "${note.filename}"`
      : note?.kind === "failed"
        ? `${String(cell.value)} (could not be fetched: ${note.error})`
        : cell.value === null
          ? "(empty)"
          : typeof cell.value === "object"
            ? JSON.stringify(cell.value)
            : String(cell.value);
  return `${cell.name} (${cell.type}): ${value}`;
}

/**
 * The instruction (`system`) and the context (`prompt`). The column's prompt
 * *is* the instruction; the row goes in as one line per column in the
 * sheet's sort order, then the target is named so the model knows which
 * cell it is filling. Audio, file and website cells are attached as files
 * (cell-attachments.ts) and their lines say so.
 */
export function buildCellMessages(
  input: RunAiInput,
  notes: CellAttachmentNotes = new Map(),
): {
  system: string;
  prompt: string;
} {
  const { prompt, target, row } = input;
  const attached = [...notes.values()].some((n) => n.kind === "attached");
  const system = [
    "You fill in one cell of a spreadsheet row.",
    `The cell belongs to the column "${target.name}" (type: ${target.type}).`,
    "Instruction for this column:",
    prompt,
    "",
    `Answer with ${TYPE_RULES[target.type]}, and nothing else. Use the other cells of the row as context${attached ? ", including the attached files" : ""}.`,
  ].join("\n");
  const lines = row.cells.map((cell) =>
    formatCellLine(cell, notes.get(cell.id)),
  );
  const promptText = [
    `Row ${row.index + 1}:`,
    ...lines,
    "",
    `Fill the column "${target.name}".`,
  ].join("\n");
  return { system, prompt: promptText };
}
