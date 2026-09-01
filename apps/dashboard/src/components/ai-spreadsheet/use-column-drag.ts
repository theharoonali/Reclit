"use client";

import type { PointerEvent } from "react";
import { dropTarget } from "@/lib/ai-spreadsheet/column-order";
import {
  dropSlotAt,
  GUTTER_WIDTH,
  maxScrollX,
} from "@/lib/ai-spreadsheet/geometry";
import type {
  ColumnDragState,
  SheetModel,
  Viewport,
} from "@/lib/ai-spreadsheet/types";

/**
 * How far the pointer must travel before a press on the grip becomes a drag.
 * A movement threshold rather than a hold timer: a timer means a few hundred
 * milliseconds where the user has pressed and nothing has happened, and it
 * gives the "did they click or drag?" question a worse answer.
 */
const DRAG_THRESHOLD = 4;
/** How close to an edge starts the autoscroll, and how fast it runs. */
const AUTOSCROLL_EDGE = 48;
const AUTOSCROLL_STEP = 12;

export type ColumnDragArgs = {
  modelRef: React.RefObject<SheetModel>;
  viewportRef: React.RefObject<Viewport>;
  dragRef: React.RefObject<ColumnDragState | null>;
  requestPaint: () => void;
  scrollBy: (dx: number, dy: number) => void;
  /**
   * Moves the chip that rides the pointer, and shows or hides it. Imperative
   * on purpose: it runs on every pointer move, and React state there would
   * re-render the grid dozens of times a second.
   */
  onDragVisual: (drag: ColumnDragState | null) => void;
  /** Runs once a drag actually starts: cancel the edit, drop pending writes. */
  onDragStart: () => void;
  /** Display position in, display position out. Not called for a no-op move. */
  onDrop: (columnId: string, newSortOrder: number) => void;
};

export type ColumnDragApi = ReturnType<typeof createColumnDragHandlers>;

/**
 * The column-reorder drag: pointer mechanics only, no network.
 *
 * Not a hook — a bundle of closures over refs, the same shape as
 * `createSheetPointerHandlers`, which it plugs into. Every move mutates
 * `dragRef` and calls `requestPaint()`; none of it is React state, because a
 * re-render remounts the canvas and a remounted canvas is a blank one.
 *
 * Pointer *capture* rather than window listeners: the pointer leaves the 36px
 * header strip on the first move, and capture keeps the events coming with no
 * listener to leak if the grid unmounts mid-drag.
 */
export function createColumnDragHandlers(args: ColumnDragArgs) {
  const { modelRef, viewportRef, dragRef, requestPaint, scrollBy } = args;
  const { onDragStart, onDrop, onDragVisual } = args;

  let autoscroll: number | null = null;

  const stopAutoscroll = () => {
    if (autoscroll !== null) cancelAnimationFrame(autoscroll);
    autoscroll = null;
  };

  const localX = (event: PointerEvent<HTMLElement>) =>
    event.clientX - event.currentTarget.getBoundingClientRect().left;

  /** Re-derives the drop slot from the pointer and the *current* scroll. */
  const resolveSlot = (drag: ColumnDragState) => {
    const viewport = viewportRef.current;
    const contentX = drag.x - GUTTER_WIDTH + viewport.scrollX;
    return dropSlotAt(contentX, viewport.columnCount);
  };

  /**
   * Scrolls while the pointer sits near an edge, re-resolving the slot each
   * frame — the pointer is still, but the columns under it are moving.
   */
  const runAutoscroll = () => {
    autoscroll = requestAnimationFrame(() => {
      const drag = dragRef.current;
      const viewport = viewportRef.current;
      if (!drag?.active) {
        autoscroll = null;
        return;
      }
      const fromLeft = drag.x - GUTTER_WIDTH;
      const fromRight = viewport.width - drag.x;
      const dx =
        fromLeft < AUTOSCROLL_EDGE && viewport.scrollX > 0
          ? -AUTOSCROLL_STEP
          : fromRight < AUTOSCROLL_EDGE &&
              viewport.scrollX <
                maxScrollX(viewport.columnCount, viewport.width)
            ? AUTOSCROLL_STEP
            : 0;
      if (dx === 0) {
        autoscroll = null;
        return;
      }
      scrollBy(dx, 0);
      drag.slot = resolveSlot(drag);
      requestPaint();
      runAutoscroll();
    });
  };

  /** Returns true when the press was taken — the caller must not fall through. */
  const begin = (event: PointerEvent<HTMLElement>, col: number) => {
    const columnId = modelRef.current?.columns[col]?.id;
    if (columnId === undefined) return false;
    // Without this the browser starts its own selection drag over the header.
    event.preventDefault();
    // On `currentTarget`, not `target`: the header canvas is a real child and
    // may well be what was hit.
    event.currentTarget.setPointerCapture(event.pointerId);
    const x = localX(event);
    dragRef.current = {
      col,
      columnId,
      pointerId: event.pointerId,
      startX: x,
      x,
      clientX: event.clientX,
      clientY: event.clientY,
      slot: col,
      active: false,
    };
    return true;
  };

  /** Returns true when a drag owns the pointer, so hover stays frozen. */
  const move = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return false;
    drag.x = localX(event);
    drag.clientX = event.clientX;
    drag.clientY = event.clientY;
    if (!drag.active) {
      if (Math.abs(drag.x - drag.startX) <= DRAG_THRESHOLD) return true;
      drag.active = true;
      // A debounced cell write or an open editor in the moving column would
      // flush against a grid the user is still rearranging.
      onDragStart();
    }
    const slot = resolveSlot(drag);
    const moved = slot !== drag.slot;
    drag.slot = slot;
    if (autoscroll === null) runAutoscroll();
    // The chip tracks every move; the canvas only repaints when the columns
    // would actually rearrange.
    onDragVisual(drag);
    if (moved) requestPaint();
    return true;
  };

  const end = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return false;
    stopAutoscroll();
    dragRef.current = null;
    onDragVisual(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    // A press that never passed the threshold is a click on the grip, and the
    // grip's only job is dragging — so it does nothing rather than opening the
    // column panel a stray click would.
    if (drag.active && dropTarget(drag.col, drag.slot) !== drag.col) {
      onDrop(drag.columnId, dropTarget(drag.col, drag.slot));
    }
    // After `onDrop`, never before: the drop moves the columns synchronously,
    // and painting first would show the pre-drop order for a frame — the grid
    // would visibly snap back and then forward again.
    requestPaint();
    return true;
  };

  const cancel = () => {
    if (!dragRef.current) return;
    stopAutoscroll();
    dragRef.current = null;
    onDragVisual(null);
    requestPaint();
  };

  /** Whether a press is being tracked — armed or already dragging. */
  const isDragging = () => dragRef.current !== null;

  return { begin, move, end, cancel, isDragging };
}
