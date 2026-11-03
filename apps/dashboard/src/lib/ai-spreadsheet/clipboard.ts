import type { CellValue, SelectionRect, SheetModel } from "./types";
import { cellKey } from "./types";

// The sheet's half of Excel-style clipboard: a selection serialises to TSV
// (tab-separated cells, newline-separated rows, cells holding tabs, newlines
// or quotes travel double-quoted — the dialect Excel and Sheets read and
// write), and pasted text parses back to a grid of strings. Pure, so the
// contract is testable without a browser.

/** A copy or paste touches at most this many cells (mirrors the API's cap). */
export const MAX_CLIPBOARD_CELLS = 5000;

function encodeCell(value: CellValue): string {
  if (value === null) return "";
  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/[\t\n\r"]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/**
 * The selection as TSV, in display order. Rows below the last stored row are
 * all blank, so the serialisation stops at the model's stored extent (a
 * selection over millions of virtual rows copies what exists), and the cell
 * cap truncates rather than fails.
 */
export function selectionToTsv(
  model: SheetModel,
  rect: SelectionRect,
): string | null {
  const cols = rect.colLast - rect.colFirst + 1;
  if (cols <= 0) return null;
  let lastStored = rect.rowFirst;
  for (const row of model.rowIds.keys()) {
    if (row > lastStored && row <= rect.rowLast) lastStored = row;
  }
  let rowLast = Math.min(rect.rowLast, lastStored);
  const maxRows = Math.max(1, Math.floor(MAX_CLIPBOARD_CELLS / cols));
  rowLast = Math.min(rowLast, rect.rowFirst + maxRows - 1);

  const lines: string[] = [];
  for (let row = rect.rowFirst; row <= rowLast; row++) {
    const cells: string[] = [];
    for (let col = rect.colFirst; col <= rect.colLast; col++) {
      const column = model.columns[col];
      cells.push(
        column
          ? encodeCell(model.cells.get(cellKey(row, column.id)) ?? null)
          : "",
      );
    }
    lines.push(cells.join("\t"));
  }
  return lines.join("\n");
}

/**
 * TSV (or a lone value) back to a grid of raw strings. Handles `\r\n`,
 * double-quoted cells with embedded tabs, newlines and `""` escapes. A
 * trailing newline — every spreadsheet writes one — does not add a blank row.
 */
export function parseTsv(text: string): string[][] {
  const grid: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let index = 0;
  const pushCell = () => {
    row.push(cell);
    cell = "";
  };
  const pushRow = () => {
    pushCell();
    grid.push(row);
    row = [];
  };
  while (index < text.length) {
    const char = text[index] as string;
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 2;
          continue;
        }
        quoted = false;
        index++;
        continue;
      }
      cell += char;
      index++;
      continue;
    }
    if (char === '"' && cell === "") {
      quoted = true;
      index++;
      continue;
    }
    if (char === "\t") {
      pushCell();
      index++;
      continue;
    }
    if (char === "\n" || char === "\r") {
      pushRow();
      index += char === "\r" && text[index + 1] === "\n" ? 2 : 1;
      continue;
    }
    cell += char;
    index++;
  }
  // The last cell — unless the text ended on a row break, which spreadsheet
  // apps always append; a sole trailing break is not an extra blank row.
  if (cell !== "" || row.length > 0) pushRow();
  if (grid.length === 0) grid.push([""]);
  return grid;
}
