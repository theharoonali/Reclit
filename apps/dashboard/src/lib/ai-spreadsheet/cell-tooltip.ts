import { formatCellText, isJsonObject, isResourceUrl } from "./cell-format";
import type {
  ActiveRun,
  CellValue,
  ColumnType,
  SheetFormatters,
  SheetLabels,
} from "./types";

/** How long the pointer must rest on a cell before its tooltip opens. */
export const CELL_TOOLTIP_DELAY_MS = 300;

/**
 * How long an open tooltip survives the pointer leaving its cell — enough to
 * cross onto the tooltip and scroll a long value inside it.
 */
export const CELL_TOOLTIP_GRACE_MS = 150;

export type CellTooltipContent = {
  /** The cell's whole value as text; empty when only a run is shown. */
  text: string;
  /** A working run's label ("Running", a custom stage), or null. */
  status: string | null;
};

/**
 * What hovering a cell shows: its full content, which the canvas truncates
 * to the column width. A JSON cell is pretty-printed, a file or audio cell
 * shows its URL rather than the chip's file name, everything else is the
 * same text the cell paints. A working run adds its status. `null` — no
 * tooltip — for a blank cell with nothing working on it.
 */
export function cellTooltipContent(
  value: CellValue,
  type: ColumnType,
  run: ActiveRun | undefined,
  labels: SheetLabels,
  formatters: SheetFormatters,
): CellTooltipContent | null {
  const text =
    value === null
      ? ""
      : isJsonObject(value)
        ? JSON.stringify(value, null, 2)
        : (type === "file" || type === "audio") && isResourceUrl(value)
          ? value
          : formatCellText(value, type, labels, formatters);
  const status = run ? labels.runStatus(run.status) : null;
  if (text === "" && status === null) return null;
  return { text, status };
}
