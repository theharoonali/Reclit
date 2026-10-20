import JSZip from "jszip";
import {
  SpreadsheetImportEmptyError,
  SpreadsheetImportUnreadableError,
} from "./spreadsheet.errors";

// A Word document in, every table in it out — each one a ragged grid of
// strings with its header as row 0, in document order. Pure: no prisma, no
// NestJS. Prose between tables is ignored; only tables carry rows.
//
// WordprocessingML is read with a tag scanner rather than a DOM: only a dozen
// element names matter (table, row, cell, paragraph, text run, spans), and the
// file is machine-written, well-formed XML.

type CellDraft = { paragraphs: string[]; span: number; continued: boolean };
type RowCell = { text: string; continued: boolean };

type Frame = {
  rows: RowCell[][];
  row: RowCell[] | null;
  cell: CellDraft | null;
};

const TAG_RE = /<(\/?)([\w:.-]+)([^>]*?)(\/?)>/g;
const VAL_RE = /\bw:val="([^"]*)"/;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, body: string) => {
    if (body[0] !== "#") return ENTITIES[body] ?? whole;
    const code =
      body[1] === "x" || body[1] === "X"
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
  });
}

/**
 * A merged cell is a real cell in the grid: `gridSpan` repeats the value across
 * the columns it covers, and a `vMerge` continuation copies the value from the
 * row above, so every row reads complete on its own.
 */
function closeRow(frame: Frame): void {
  const row = frame.row;
  frame.row = null;
  if (!row) return;
  const above = frame.rows[frame.rows.length - 1];
  frame.rows.push(
    row.map((cell, index) =>
      cell.continued
        ? { text: above?.[index]?.text ?? "", continued: false }
        : cell,
    ),
  );
}

function closeCell(frame: Frame): void {
  const cell = frame.cell;
  frame.cell = null;
  if (!cell || !frame.row) return;
  const text = cell.paragraphs
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== "")
    .join("\n");
  for (let n = 0; n < cell.span; n += 1) {
    frame.row.push({ text, continued: cell.continued });
  }
}

/** Every table in `word/document.xml`, nested ones flattened into their cell. */
export function tablesFromXml(xml: string): string[][][] {
  const tables: string[][][] = [];
  const stack: Frame[] = [];
  let nested = 0; // tables inside a cell contribute text to that cell only
  let fallback = 0; // `mc:Fallback` duplicates its `mc:Choice` sibling
  let inText = false;
  let last = 0;

  const top = () => stack[stack.length - 1];
  const append = (text: string) => {
    const cell = top()?.cell;
    if (!cell || fallback > 0) return;
    if (cell.paragraphs.length === 0) cell.paragraphs.push("");
    cell.paragraphs[cell.paragraphs.length - 1] += text;
  };

  for (const match of xml.matchAll(TAG_RE)) {
    if (inText) append(decode(xml.slice(last, match.index)));
    last = match.index + match[0].length;
    const [, closing, name, attrs = "", selfClosing] = match;
    const open = closing === "";

    if (name === "mc:Fallback" && !selfClosing) fallback += open ? 1 : -1;
    if (fallback > 0) continue;

    switch (name) {
      case "w:tbl":
        if (top()?.cell) nested += open ? 1 : -1;
        else if (open) stack.push({ rows: [], row: null, cell: null });
        else {
          const frame = stack.pop();
          if (frame) tables.push(frame.rows.map((r) => r.map((c) => c.text)));
        }
        break;
      case "w:tr":
        if (nested > 0) break;
        if (open) {
          const frame = top();
          if (frame) frame.row = [];
        } else if (top()) closeRow(top() as Frame);
        break;
      case "w:tc":
        if (nested > 0) break;
        if (open) {
          const frame = top();
          if (frame) frame.cell = { paragraphs: [], span: 1, continued: false };
        } else if (top()) closeCell(top() as Frame);
        break;
      case "w:gridSpan": {
        const cell = top()?.cell;
        const span = Number(VAL_RE.exec(attrs)?.[1]);
        if (cell && nested === 0 && span > 1) cell.span = Math.min(span, 64);
        break;
      }
      case "w:vMerge": {
        const cell = top()?.cell;
        // No `w:val`, or "continue", marks a continuation; "restart" opens one.
        if (cell && nested === 0) {
          cell.continued = VAL_RE.exec(attrs)?.[1] !== "restart";
        }
        break;
      }
      case "w:p":
        if (open && !selfClosing) top()?.cell?.paragraphs.push("");
        break;
      case "w:t":
        inText = open && !selfClosing;
        break;
      case "w:tab":
        append(" ");
        break;
      case "w:br":
      case "w:cr":
        append("\n");
        break;
    }
  }
  return tables;
}

/**
 * A table needs a header row and at least one more row to be data. Single-row
 * and blank-header tables are page layout (letterheads, signature boxes).
 */
function isDataTable(table: string[][]): boolean {
  return (
    table.length >= 2 && (table[0] ?? []).some((cell) => cell.trim() !== "")
  );
}

export async function readDocx(bytes: Uint8Array): Promise<string[][][]> {
  let xml: string | undefined;
  try {
    const zip = await JSZip.loadAsync(bytes);
    xml = await zip.file("word/document.xml")?.async("string");
  } catch (error) {
    throw new SpreadsheetImportUnreadableError(
      error instanceof Error ? error.message : "not a readable document",
    );
  }
  if (xml === undefined) {
    throw new SpreadsheetImportUnreadableError("not a Word document");
  }
  const tables = tablesFromXml(xml).filter(isDataTable);
  if (tables.length === 0) throw new SpreadsheetImportEmptyError();
  return tables;
}
