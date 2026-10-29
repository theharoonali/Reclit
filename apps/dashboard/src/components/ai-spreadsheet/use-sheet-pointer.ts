"use client";

import type { MouseEvent, PointerEvent } from "react";
import {
  fileLabel,
  isJsonObject,
  isResourceUrl,
} from "@/lib/ai-spreadsheet/cell-format";
import { isEmailNode } from "@/lib/ai-spreadsheet/email-cell";
import {
  cellRect,
  containsPoint,
  GUTTER_WIDTH,
  headerCheckboxRect,
  hitTest,
  hitTestHeader,
  inflateRect,
  isHeaderColumnHit,
} from "@/lib/ai-spreadsheet/geometry";
import { AUDIO_LEADING, capsuleRect } from "@/lib/ai-spreadsheet/paint-cell";
import {
  rowRangeAddresses,
  selectAllState,
  storedRowBounds,
} from "@/lib/ai-spreadsheet/row-selection";
import type {
  CellValue,
  SheetFonts,
  SheetHit,
  SheetLabels,
  SheetModel,
  Viewport,
} from "@/lib/ai-spreadsheet/types";
import type { CellEditorApi } from "./use-cell-editor";
import type { ColumnDragApi } from "./use-column-drag";
import type { RangeDragApi } from "./use-sheet-drag-select";

export type SheetPointerArgs = {
  modelRef: React.RefObject<SheetModel>;
  viewportRef: React.RefObject<Viewport>;
  ctxRef: React.RefObject<CanvasRenderingContext2D | null>;
  fontsRef: React.RefObject<SheetFonts>;
  /** Which column (if any) the pointer is over, for the header highlight. */
  hoverRef: React.RefObject<SheetHit>;
  labels: SheetLabels;
  editor: CellEditorApi;
  /** The column-reorder drag; it gets first refusal on every header pointer event. */
  drag: ColumnDragApi;
  /** The press-and-drag selection; a body press arms it once it has set the selection. */
  rangeDrag: RangeDragApi;
  /** Which column's grip is under the pointer, for the "Drag and drop" tooltip. */
  onGripHover: (col: number | null) => void;
  getCell: (row: number, columnId: string) => CellValue;
  requestPaint: () => void;
  onOpenJson: (row: number, columnId: string) => void;
  onOpenColumn: (columnId?: string) => void;
  onRemoveColumn: (columnId: string) => void;
  onToggleAudio: (row: number, columnId: string, url: string) => void;
};

/** The extra slack around the 14px select-all checkbox that makes it comfortably clickable. */
const CHECKBOX_HIT_PAD = 5;

/**
 * Turns pointer events on the two canvases into sheet actions.
 *
 * Not a hook — no state of its own, just a bundle of handlers over the refs it
 * is given. It is separate from `use-sheet-canvas.ts` because hit-testing and
 * painting are different jobs that happen to share a coordinate system.
 */
export function createSheetPointerHandlers(args: SheetPointerArgs) {
  const { modelRef, viewportRef, ctxRef, fontsRef, hoverRef } = args;
  const { labels, editor, drag, rangeDrag, onGripHover } = args;
  const { getCell, requestPaint } = args;
  const { onOpenJson, onOpenColumn, onRemoveColumn, onToggleAudio } = args;

  /** Canvas-relative CSS pixels. DPR never enters this — see `geometry`. */
  const localPoint = (event: MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  /**
   * What the pointer landed on, when it landed on a capsule chip. It calls the
   * same `capsuleRect` the painter used, so the chip you can click is by
   * construction the chip that was drawn.
   *
   * Boolean capsules are deliberately absent: they toggle on double-click like
   * every other cell edits on double-click, so a single click on one only
   * selects. One click never changes data.
   */
  const capsuleTargetAt = (
    row: number,
    col: number,
    x: number,
    y: number,
  ):
    | { kind: "json"; columnId: string }
    | { kind: "file"; url: string }
    | { kind: "audio"; columnId: string; url: string }
    | null => {
    const ctx = ctxRef.current;
    const column = modelRef.current?.columns[col];
    const viewport = viewportRef.current;
    if (!ctx || !column || !viewport) return null;

    /**
     * `leading` must be whatever the painter reserved for that chip's kind, or
     * the clickable region stops matching the drawn one.
     */
    const hits = (label: string, leading = 0) => {
      ctx.font = fontsRef.current.cell;
      const chip = capsuleRect(
        ctx,
        cellRect(viewport.layout, row, col),
        label,
        leading,
      );
      return containsPoint(
        chip,
        x - GUTTER_WIDTH + viewport.scrollX,
        y + viewport.scrollY,
      );
    };

    const value = getCell(row, column.id);
    // A Mail cell paints count chips, not the json chip, and its object is
    // read-only — no JSON panel, so no chip target either.
    if (isEmailNode(column)) return null;
    if (column.type === "json" && isJsonObject(value)) {
      const label = labels.jsonCapsule(Object.keys(value).length);
      return hits(label) ? { kind: "json", columnId: column.id } : null;
    }
    if (column.type === "file" && isResourceUrl(value)) {
      return hits(fileLabel(value)) ? { kind: "file", url: value } : null;
    }
    if (column.type === "audio" && isResourceUrl(value)) {
      return hits(fileLabel(value), AUDIO_LEADING)
        ? { kind: "audio", columnId: column.id, url: value }
        : null;
    }
    return null;
  };

  /** Selects rows `anchorRow..row` as the rectangle spanning every column. */
  const selectRows = (anchorRow: number, row: number) => {
    const { anchor, active } = rowRangeAddresses(
      anchorRow,
      row,
      viewportRef.current.columnCount,
    );
    editor.selectRange(anchor, active);
  };

  const handleBodyPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const { x, y } = localPoint(event);
    // Kills the text-selection drag. It also cancels the focus the click would
    // have given us, which is why the editor re-focuses the proxy explicitly.
    event.preventDefault();
    const viewport = viewportRef.current;
    const hit = hitTest(x, y, viewport);

    // A row number selects its whole row — the rectangle across every column.
    // The press then arms a drag down the numbers. Nothing to select without
    // a column.
    if (hit.kind === "gutter") {
      if (viewport.columnCount === 0) {
        editor.focusProxy();
        return;
      }
      const { anchor, active } = rowRangeAddresses(
        hit.row,
        hit.row,
        viewport.columnCount,
      );
      // Shift picks the row as an area of its own — or unpicks it, and then
      // there is nothing to drag.
      if (event.shiftKey) {
        if (!editor.toggleArea(anchor, active)) return;
      } else {
        editor.selectRange(anchor, active);
      }
      rangeDrag.begin(event, "rows");
      return;
    }
    if (hit.kind !== "cell") {
      editor.focusProxy();
      return;
    }

    // Shift-click picks the cell as an area of its own (or unpicks it) and
    // nothing more — a capsule under the pointer must not open files or
    // toggle audio mid-selection. The press then arms a drag that grows the
    // new area into a rectangle.
    if (event.shiftKey) {
      const cell = { row: hit.row, col: hit.col };
      if (editor.toggleArea(cell, cell)) rangeDrag.begin(event, "cells");
      return;
    }

    editor.selectCell(hit.row, hit.col);

    // A press on a chip is a click on the chip; only a press on the cell
    // itself can grow into a drag.
    const target = capsuleTargetAt(hit.row, hit.col, x, y);
    if (!target) {
      rangeDrag.begin(event, "cells");
      return;
    }
    if (target.kind === "json") {
      onOpenJson(hit.row, target.columnId);
      return;
    }

    // Both remaining chips act on the click itself, so both only act on the
    // first of a burst: without the guard, double-clicking a file chip opens
    // two tabs and double-clicking a audio chip starts then stops the note.
    if (event.detail > 1) return;

    if (target.kind === "audio") {
      onToggleAudio(hit.row, target.columnId, target.url);
      return;
    }

    // Opened straight from the pointer handler so it counts as a user gesture
    // and survives the popup blocker. `preventDefault()` above does not stop
    // this — it only cancels the text-selection drag and the focus change.
    window.open(target.url, "_blank", "noopener,noreferrer");
  };

  const handleBodyPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    rangeDrag.move(event);
  };

  const handleBodyPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    rangeDrag.end(event);
  };

  const handleBodyPointerCancel = () => {
    rangeDrag.cancel();
  };

  const handleBodyDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    const { x, y } = localPoint(event);
    const hit = hitTest(x, y, viewportRef.current);
    if (hit.kind === "cell") editor.beginEdit(hit.row, hit.col);
  };

  /**
   * The header corner: every stored row already selected → clear; otherwise
   * select from the first stored row to the last. Nothing stored, or no
   * column, and there is nothing for "all" to mean.
   */
  const toggleAllRows = () => {
    const model = modelRef.current;
    const columnCount = viewportRef.current.columnCount;
    const bounds = model ? storedRowBounds(model) : null;
    if (!model || !bounds || columnCount === 0) return;
    const state = selectAllState(editor.editorRef.current, model, columnCount);
    if (state === "all") editor.clearSelection();
    else selectRows(bounds.last, bounds.first);
  };

  const handleHeaderPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const { x, y } = localPoint(event);
    // The corner block is left of every column, so the select-all checkbox is
    // checked before the column hit-test (which starts at GUTTER_WIDTH).
    const corner = inflateRect(headerCheckboxRect(), CHECKBOX_HIT_PAD);
    if (containsPoint(corner, x, y)) {
      toggleAllRows();
      return;
    }
    const hit = hitTestHeader(x, y, viewportRef.current);
    // Before the `header` branch: a press on the grip starts a drag and must
    // never also open the column panel.
    if (hit.kind === "header-grip" && drag.begin(event, hit.col)) {
      // The tooltip would otherwise hang over the column for the whole drag.
      onGripHover(null);
      return;
    }
    if (hit.kind === "plus") onOpenColumn();
    else if (hit.kind === "header-delete") {
      const columnId = modelRef.current?.columns[hit.col]?.id;
      if (columnId) onRemoveColumn(columnId);
    } else if (hit.kind === "header") {
      onOpenColumn(modelRef.current?.columns[hit.col]?.id);
    }
  };

  const handleHeaderPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    // A drag owns the pointer: the hover must stay on the column being moved.
    if (drag.move(event)) return;
    const { x, y } = localPoint(event);
    const hit = hitTestHeader(x, y, viewportRef.current);
    const previous = hoverRef.current;
    // The three column kinds are distinct on purpose: crossing onto the grip
    // or the delete glyph within one column must still repaint.
    const same = isHeaderColumnHit(hit)
      ? previous.kind === hit.kind &&
        "col" in previous &&
        previous.col === hit.col
      : hit.kind === previous.kind;
    if (same) return;
    hoverRef.current = hit;
    onGripHover(hit.kind === "header-grip" ? hit.col : null);
    requestPaint();
  };

  const handleHeaderPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    drag.end(event);
  };

  const handleHeaderPointerCancel = () => {
    drag.cancel();
  };

  const handleHeaderPointerLeave = () => {
    // Pointer capture normally suppresses this mid-drag; the guard covers a
    // capture that never took, which would otherwise blank the hover.
    if (drag.isDragging() || hoverRef.current.kind === "empty") return;
    hoverRef.current = { kind: "empty" };
    onGripHover(null);
    requestPaint();
  };

  return {
    handleBodyPointerDown,
    handleBodyPointerMove,
    handleBodyPointerUp,
    handleBodyPointerCancel,
    handleBodyDoubleClick,
    handleHeaderPointerDown,
    handleHeaderPointerMove,
    handleHeaderPointerUp,
    handleHeaderPointerCancel,
    handleHeaderPointerLeave,
  };
}
