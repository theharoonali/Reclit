"use client";

import type { PointerEvent } from "react";
import {
  AUTOSCROLL_EDGE,
  AUTOSCROLL_STEP,
  COL_WIDTH,
  clamp,
  GUTTER_WIDTH,
  ROW_HEIGHT,
} from "@/lib/ai-spreadsheet/geometry";
import { rowRangeAddresses } from "@/lib/ai-spreadsheet/row-selection";
import type { RangeDragState, Viewport } from "@/lib/ai-spreadsheet/types";
import type { CellEditorApi } from "./use-cell-editor";

export type RangeDragMode = RangeDragState["mode"];

export type RangeDragArgs = {
  viewportRef: React.RefObject<Viewport>;
  /**
   * The drag in flight. Owned by the caller: these handlers are rebuilt on
   * every grid render, and a selection change renders the grid mid-drag.
   */
  dragRef: React.RefObject<RangeDragState | null>;
  editor: Pick<CellEditorApi, "editorRef" | "extendTo" | "selectRange">;
  scrollBy: (dx: number, dy: number) => void;
};

export type RangeDragApi = ReturnType<typeof createRangeDragHandlers>;

/**
 * Press-and-drag selection: pointer mechanics only.
 *
 * The sibling of `createColumnDragHandlers` — a bundle of closures over refs
 * that `createSheetPointerHandlers` plugs into. The press has already set the
 * selection (a cell, or a whole row from the gutter); every move extends it to
 * the cell under the pointer through the editor, which repaints. Nothing here
 * is React state, because a re-render remounts the canvas and a remounted
 * canvas is a blank one — and nothing is closure state either, because the
 * re-render a selection change causes rebuilds these closures mid-drag.
 *
 * Pointer *capture* rather than window listeners: the pointer leaves the
 * scroller the moment it crosses the header or the gutter, and capture keeps
 * the moves coming with no listener to leak. The body has no `touch-none`, so
 * a touch pan is still a scroll — the browser takes the pointer and fires
 * `pointercancel`, which ends the drag.
 */
export function createRangeDragHandlers(args: RangeDragArgs) {
  const { viewportRef, dragRef, editor, scrollBy } = args;

  const stopAutoscroll = (drag: RangeDragState) => {
    if (drag.autoscroll !== null) cancelAnimationFrame(drag.autoscroll);
    drag.autoscroll = null;
  };

  const localPoint = (event: PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  /**
   * Extends the selection to the cell under the pointer, clamped into the
   * sheet: over the gutter is column 0, past the last column is the last
   * column, above or below the viewport is whatever row the scroll has
   * brought there.
   */
  const apply = () => {
    const drag = dragRef.current;
    const viewport = viewportRef.current;
    if (!drag || viewport.columnCount === 0) return;
    const row = clamp(
      Math.floor((drag.y + viewport.scrollY) / ROW_HEIGHT),
      0,
      viewport.rowExtent - 1,
    );
    const col = clamp(
      Math.floor((drag.x - GUTTER_WIDTH + viewport.scrollX) / COL_WIDTH),
      0,
      viewport.columnCount - 1,
    );
    if (drag.last && drag.last.row === row && drag.last.col === col) return;
    drag.last = { row, col };
    if (drag.mode === "cells") {
      editor.extendTo(row, col);
      return;
    }
    // Rows: the press fixed the anchor row; only the active row follows.
    const before = editor.editorRef.current;
    const { anchor, active } = rowRangeAddresses(
      before.anchor?.row ?? row,
      row,
      viewport.columnCount,
    );
    editor.selectRange(anchor, active, before.areas);
  };

  /**
   * Scrolls while the pointer sits near an edge, re-applying each frame — the
   * pointer is still, but the cells under it are moving. A row drag scrolls
   * vertically only: its selection already spans every column. The loop ends
   * when the scroll stops moving (an edge of the sheet), and a pointer move
   * restarts it.
   */
  const runAutoscroll = () => {
    const drag = dragRef.current;
    if (!drag) return;
    drag.autoscroll = requestAnimationFrame(() => {
      // Still the same drag? A new press would have its own state object.
      if (dragRef.current !== drag) return;
      drag.autoscroll = null;
      const viewport = viewportRef.current;
      const dy =
        drag.y < AUTOSCROLL_EDGE
          ? -AUTOSCROLL_STEP
          : drag.y > viewport.height - AUTOSCROLL_EDGE
            ? AUTOSCROLL_STEP
            : 0;
      const dx =
        drag.mode === "rows"
          ? 0
          : drag.x < GUTTER_WIDTH + AUTOSCROLL_EDGE
            ? -AUTOSCROLL_STEP
            : drag.x > viewport.width - AUTOSCROLL_EDGE
              ? AUTOSCROLL_STEP
              : 0;
      if (dx === 0 && dy === 0) return;
      const { scrollX, scrollY } = viewport;
      scrollBy(dx, dy);
      if (viewport.scrollX === scrollX && viewport.scrollY === scrollY) return;
      apply();
      runAutoscroll();
    });
  };

  /** Arms the drag for a press the caller has already turned into a selection. */
  const begin = (event: PointerEvent<HTMLElement>, mode: RangeDragMode) => {
    // On `currentTarget`, not `target`: the press may have landed on the spacer.
    event.currentTarget.setPointerCapture(event.pointerId);
    const { x, y } = localPoint(event);
    dragRef.current = {
      pointerId: event.pointerId,
      mode,
      x,
      y,
      last: null,
      autoscroll: null,
    };
  };

  /** Returns true when a drag owns the pointer. */
  const move = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return false;
    const { x, y } = localPoint(event);
    drag.x = x;
    drag.y = y;
    apply();
    if (drag.autoscroll === null) runAutoscroll();
    return true;
  };

  const end = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return false;
    stopAutoscroll(drag);
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    return true;
  };

  const cancel = () => {
    const drag = dragRef.current;
    if (!drag) return;
    stopAutoscroll(drag);
    dragRef.current = null;
  };

  const isDragging = () => dragRef.current !== null;

  return { begin, move, end, cancel, isDragging };
}
