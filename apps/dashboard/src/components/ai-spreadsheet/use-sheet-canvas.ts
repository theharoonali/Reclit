"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCanvasSurface } from "@/hooks/use-canvas-surface";
import {
  CELL_TOOLTIP_DELAY_MS,
  CELL_TOOLTIP_GRACE_MS,
  cellTooltipContent,
} from "@/lib/ai-spreadsheet/cell-tooltip";
import { dropTarget, previewOrder } from "@/lib/ai-spreadsheet/column-order";
import {
  COL_WIDTH,
  clamp,
  GUTTER_WIDTH,
  headerGripRect,
  ROW_HEIGHT,
} from "@/lib/ai-spreadsheet/geometry";
import { paintBody } from "@/lib/ai-spreadsheet/paint-body";
import { paintEditor } from "@/lib/ai-spreadsheet/paint-editor";
import { paintHeader } from "@/lib/ai-spreadsheet/paint-header";
import { selectAllState } from "@/lib/ai-spreadsheet/row-selection";
import {
  type CellAddress,
  type CellValue,
  type ColumnDragState,
  cellKey,
  type RangeDragState,
  type SheetFormatters,
  type SheetHit,
  type SheetLabels,
  type SheetModel,
} from "@/lib/ai-spreadsheet/types";
import { useCellEditor } from "./use-cell-editor";
import { createColumnDragHandlers } from "./use-column-drag";
import { useSheetAudio } from "./use-sheet-audio";
import { createRangeDragHandlers } from "./use-sheet-drag-select";
import { createSheetPointerHandlers } from "./use-sheet-pointer";
import { useSheetRuns } from "./use-sheet-runs";
import { useSheetScroll } from "./use-sheet-scroll";
import { useSheetViewport } from "./use-sheet-viewport";

export type SheetCanvasArgs = {
  modelRef: React.RefObject<SheetModel>;
  columnsVersion: number;
  rowCount: number;
  labels: SheetLabels;
  formatters: SheetFormatters;
  getCell: (row: number, columnId: string) => CellValue;
  setCell: (row: number, columnId: string, value: CellValue) => void;
  /** Model-only write, for values the server already holds (a finished AI run). */
  setCellLocal: (row: number, columnId: string, value: CellValue) => void;
  /** Whether the run stream should be open; its capsules exist only while it is. */
  runListening: boolean;
  /** The server ended the run stream: the last working run finished. */
  onRunEnded: () => void;
  /** The set of working runs changed. See use-sheet-runs. */
  onRunsChange?: () => void;
  /** The selected rectangle changed. See use-cell-editor. */
  onSelectionChange?: () => void;
  onOpenJson: (row: number, columnId: string) => void;
  onOpenDate: (row: number, columnId: string) => void;
  onOpenAudio: (row: number, columnId: string) => void;
  onOpenFile: (row: number, columnId: string) => void;
  onOpenColumn: (columnId?: string) => void;
  onRemoveColumn: (columnId: string) => void;
  /** A dropped header grip: the moved column and its new display position. */
  onReorderColumn: (columnId: string, newSortOrder: number) => void;
  /** Runs when a drag or a delete starts: cancel the edit, drop pending writes. */
  onBeforeColumnChange: () => void;
  /** The chip that rides the pointer, and the label written into it. */
  dragChipRef: React.RefObject<HTMLDivElement | null>;
  dragChipLabelRef: React.RefObject<HTMLSpanElement | null>;
  /** Flips when the cell selection goes empty ↔ non-empty. See use-cell-editor. */
  onSelectionPresence?: (has: boolean) => void;
};

/**
 * Wires the two canvases together: sizing, painting, scrolling, pointer
 * routing and the editor. The grid component is then only layout.
 *
 * The whole render path reads refs. Nothing here calls `setState` in response
 * to a scroll, a keystroke or a cell edit — a re-render could remount a canvas
 * and a remounted canvas is a blank one.
 */
export function useSheetCanvas(args: SheetCanvasArgs) {
  const { modelRef, columnsVersion, rowCount, labels, formatters } = args;
  const { getCell, setCell, setCellLocal } = args;
  const { runListening, onRunEnded, onRunsChange, onSelectionChange } = args;
  const { onOpenJson, onOpenDate, onOpenAudio, onOpenFile, onOpenColumn } =
    args;
  const { onRemoveColumn, onReorderColumn, onSelectionPresence } = args;
  const { onBeforeColumnChange, dragChipRef, dragChipLabelRef } = args;

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const spacerRef = useRef<HTMLDivElement | null>(null);
  const hoverRef = useRef<SheetHit>({ kind: "empty" });
  // A ref, never state: a drag repaints on every pointer move, and a
  // re-render would remount the canvas and blank it.
  const dragRef = useRef<ColumnDragState | null>(null);
  // Same again for the range drag — and a selection change re-renders the
  // grid mid-drag, so the handlers below are rebuilt while it is in flight.
  const rangeDragRef = useRef<RangeDragState | null>(null);
  // The one piece of drag-adjacent React state. It flips only when the pointer
  // crosses onto or off a grip — not on the paint path — because a tooltip
  // needs a real DOM anchor and a real `open` prop.
  const [gripCol, setGripCol] = useState<number | null>(null);
  // The cell whose full-content tooltip is open. Same rule as `gripCol`: it
  // changes when the pointer settles on another cell, never per move. The
  // refs hold what the pointer is over now (`hoverTargetRef`, maybe still
  // waiting out the delay) and what the state last became (`hoverShownRef`),
  // so a scroll or a drag can close it without a render when nothing is open.
  // The tooltip is itself hoverable — a long value scrolls inside it — so
  // leaving the cell does not close it at once: the change waits
  // `CELL_TOOLTIP_GRACE_MS`, and reaching the tooltip in that time keeps it
  // open (`hoverPinnedRef`) until the pointer leaves the tooltip.
  const [hoverCell, setHoverCell] = useState<CellAddress | null>(null);
  const hoverTargetRef = useRef<CellAddress | null>(null);
  const hoverShownRef = useRef<CellAddress | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverPinnedRef = useRef(false);

  const cancelHoverTimer = useCallback(() => {
    if (hoverTimerRef.current !== null) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  /** Closes the tooltip now: a press, a scroll, a drag, the pointer leaving it. */
  const clearHover = useCallback(() => {
    hoverTargetRef.current = null;
    hoverPinnedRef.current = false;
    cancelHoverTimer();
    if (hoverShownRef.current !== null) {
      hoverShownRef.current = null;
      setHoverCell(null);
    }
  }, [cancelHoverTimer]);

  /**
   * The body pointer is over `hit`. A new cell opens its tooltip after
   * `CELL_TOOLTIP_DELAY_MS`; while one is open, moving to another cell or
   * off the cells waits `CELL_TOOLTIP_GRACE_MS`, so the pointer can cross
   * onto the tooltip to scroll it.
   */
  const onCellHover = useCallback(
    (hit: SheetHit) => {
      if (hoverPinnedRef.current) return;
      const open = hoverShownRef.current !== null;
      if (hit.kind !== "cell") {
        if (!open) {
          clearHover();
          return;
        }
        if (hoverTargetRef.current === null) return;
        hoverTargetRef.current = null;
        cancelHoverTimer();
        hoverTimerRef.current = setTimeout(clearHover, CELL_TOOLTIP_GRACE_MS);
        return;
      }
      const current = hoverTargetRef.current;
      if (current && current.row === hit.row && current.col === hit.col) {
        return;
      }
      const target = { row: hit.row, col: hit.col };
      hoverTargetRef.current = target;
      cancelHoverTimer();
      const shown = hoverShownRef.current;
      if (shown && shown.row === target.row && shown.col === target.col) {
        return; // back on the open cell before the grace ran out
      }
      const show = () => {
        hoverTimerRef.current = null;
        hoverShownRef.current = target;
        setHoverCell(target);
      };
      hoverTimerRef.current = setTimeout(
        show,
        open ? CELL_TOOLTIP_GRACE_MS : CELL_TOOLTIP_DELAY_MS,
      );
    },
    [cancelHoverTimer, clearHover],
  );

  /** The pointer reached the open tooltip: keep it until the pointer leaves. */
  const holdHover = useCallback(() => {
    if (hoverShownRef.current === null) return;
    cancelHoverTimer();
    hoverPinnedRef.current = true;
    hoverTargetRef.current = hoverShownRef.current;
  }, [cancelHoverTimer]);

  useEffect(
    () => () => {
      if (hoverTimerRef.current !== null) clearTimeout(hoverTimerRef.current);
    },
    [],
  );

  const view = useSheetViewport(
    rowCount,
    modelRef.current?.columns.length ?? 0,
  );
  const { viewportRef, paletteRef, fontsRef, paintRef, requestPaint } = view;

  const { syncGeometry, scrollCellIntoView, scrollBy } = useSheetScroll({
    scrollerRef,
    spacerRef,
    viewportRef,
    requestPaint,
    // The tooltip's anchor was placed for the old scroll position.
    onScrolled: clearHover,
  });

  // Measured against the scroller's client box, not its own parent — the
  // canvas lives outside the scroller precisely so it cannot feed back into
  // it. See `ai-spreadsheet-body.tsx`.
  const body = useCanvasSurface(() => {
    const viewport = viewportRef.current;
    viewport.width = body.sizeRef.current.width;
    viewport.height = body.sizeRef.current.height;
    syncGeometry();
    requestPaint();
  }, scrollerRef);
  const header = useCanvasSurface(requestPaint);

  const bodyCtxRef = body.ctxRef;
  const bodySizeRef = body.sizeRef;
  const headerCtxRef = header.ctxRef;
  const headerSizeRef = header.sizeRef;

  const audio = useSheetAudio(requestPaint);
  const runs = useSheetRuns({
    modelRef,
    listening: runListening,
    setCellLocal,
    requestPaint,
    onEnded: onRunEnded,
    onRunsChange,
  });

  const editor = useCellEditor({
    modelRef,
    viewportRef,
    ctxRef: bodyCtxRef,
    fontsRef,
    getCell,
    setCell,
    requestPaint,
    scrollCellIntoView,
    onOpenJson,
    onOpenDate,
    onOpenAudio,
    onOpenFile,
    onSelectionPresence,
    onSelectionChange,
  });
  const { editorRef, proxyRef } = editor;

  /**
   * Moves the drag chip. Written straight onto the node: this runs on every
   * pointer move, and a re-render there would remount-risk the canvas and
   * throw away frames for a card that is one `transform` away from correct.
   */
  const setDragVisual = useCallback(
    (drag: ColumnDragState | null) => {
      const chip = dragChipRef.current;
      if (!chip) return;
      if (drag === null || !drag.active) {
        chip.classList.add("hidden");
        return;
      }
      const label = dragChipLabelRef.current;
      const name = modelRef.current?.columns[drag.col]?.name;
      if (label && name !== undefined && label.textContent !== name) {
        label.textContent = name;
      }
      chip.classList.remove("hidden");
      // Offset so the card sits below-right of the cursor rather than under it.
      chip.style.transform = `translate3d(${drag.clientX + 12}px, ${drag.clientY + 14}px, 0)`;
    },
    [dragChipLabelRef, dragChipRef, modelRef],
  );

  const columnDrag = createColumnDragHandlers({
    modelRef,
    viewportRef,
    dragRef,
    requestPaint,
    scrollBy,
    onDragStart: onBeforeColumnChange,
    onDrop: onReorderColumn,
    onDragVisual: setDragVisual,
  });

  // The press-and-drag selection, armed by the body's pointer handlers once
  // the press has set the selection; it extends through the editor.
  const rangeDrag = createRangeDragHandlers({
    viewportRef,
    dragRef: rangeDragRef,
    editor,
    scrollBy,
  });

  /** For post-delete cleanup: a stale hover would paint a ghost affordance. */
  const resetHover = useCallback(() => {
    hoverRef.current = { kind: "empty" };
    // A column was removed or moved: the hovered cell names another column.
    clearHover();
  }, [clearHover]);

  /** Parks the hidden textarea over the active cell — see the proxy's docs. */
  const positionProxy = useCallback(() => {
    const proxy = proxyRef.current;
    const active = editorRef.current.active;
    const viewport = viewportRef.current;
    if (!proxy || !active) return;
    const x = GUTTER_WIDTH + active.col * COL_WIDTH - viewport.scrollX;
    const y = active.row * ROW_HEIGHT - viewport.scrollY;
    proxy.style.left = `${clamp(x, 0, Math.max(0, viewport.width - 1))}px`;
    proxy.style.top = `${clamp(y, 0, Math.max(0, viewport.height - 1))}px`;
  }, [editorRef, proxyRef, viewportRef]);

  const paint = useCallback(() => {
    const model = modelRef.current;
    const viewport = viewportRef.current;
    if (!model) return;
    viewport.columnCount = model.columns.length;

    // Nothing previews until the press has passed the threshold — a click on
    // the grip must not shuffle the grid.
    const drag = dragRef.current?.active === true ? dragRef.current : null;
    // Paint-only: the columns shown in the order the drop would produce, which
    // is what shows where the column lands. The model is untouched, and the
    // order the grid actually adopts still comes from the API's response.
    const draggingCol = drag === null ? null : dropTarget(drag.col, drag.slot);
    const columns =
      drag === null || draggingCol === null
        ? model.columns
        : previewOrder(model.columns, drag.col, draggingCol);

    const bodyCtx = bodyCtxRef.current;
    if (bodyCtx) {
      const shared = {
        ctx: bodyCtx,
        dpr: bodySizeRef.current.dpr,
        viewport,
        palette: paletteRef.current,
        fonts: fontsRef.current,
      };
      paintBody({
        ...shared,
        model,
        editor: editorRef.current,
        labels,
        formatters,
        playing: audio.playingRef.current,
        runs: runs.runsRef.current,
        runPhase: runs.phaseRef.current,
        columns,
        draggingCol,
      });
      paintEditor({ ...shared, editor: editorRef.current });
      positionProxy();
    }

    const headerCtx = headerCtxRef.current;
    if (headerCtx) {
      paintHeader({
        ctx: headerCtx,
        dpr: headerSizeRef.current.dpr,
        viewport,
        stripWidth: headerSizeRef.current.width,
        columns,
        palette: paletteRef.current,
        labels,
        fonts: fontsRef.current,
        hover: hoverRef.current,
        draggingCol,
        selectAll: selectAllState(
          editorRef.current,
          model,
          model.columns.length,
        ),
      });
    }
  }, [
    audio.playingRef,
    bodyCtxRef,
    bodySizeRef,
    editorRef,
    fontsRef,
    formatters,
    headerCtxRef,
    headerSizeRef,
    labels,
    modelRef,
    paletteRef,
    positionProxy,
    runs.phaseRef,
    runs.runsRef,
    viewportRef,
  ]);

  useEffect(() => {
    paintRef.current = paint;
    requestPaint();
  }, [paint, paintRef, requestPaint]);

  // Adding a column widens the content, so the spacer has to grow with it.
  useEffect(() => {
    const model = modelRef.current;
    if (model) viewportRef.current.columnCount = model.columns.length;
    syncGeometry();
    requestPaint();
  }, [columnsVersion, modelRef, requestPaint, syncGeometry, viewportRef]);

  const pointer = createSheetPointerHandlers({
    modelRef,
    viewportRef,
    ctxRef: bodyCtxRef,
    fontsRef,
    hoverRef,
    labels,
    editor,
    drag: columnDrag,
    onGripHover: setGripCol,
    onCellHover,
    onCellHoverEnd: clearHover,
    getCell,
    requestPaint,
    onOpenJson,
    onOpenColumn,
    onRemoveColumn,
    onToggleAudio: audio.toggle,
    rangeDrag,
  });

  // Canvas space, for the tooltip's anchor. Read from the viewport ref at
  // render time: the hover that set `gripCol` was resolved against this same
  // scroll position, and any change to it arrives as another pointer move.
  const gripAnchor =
    gripCol === null
      ? null
      : {
          x:
            GUTTER_WIDTH +
            headerGripRect(gripCol).x -
            viewportRef.current.scrollX,
          y: headerGripRect(gripCol).y,
        };

  // The hovered cell's box in body-canvas space and what its tooltip says,
  // read at render like `gripAnchor`. Nothing while that cell is being
  // edited: the editor already shows the whole value.
  const hoverColumn =
    hoverCell === null ? undefined : modelRef.current?.columns[hoverCell.col];
  const editorState = editorRef.current;
  const editingHovered =
    hoverCell !== null &&
    editorState.mode === "editing" &&
    editorState.active?.row === hoverCell.row &&
    editorState.active?.col === hoverCell.col;
  const cellTooltip =
    hoverCell === null || hoverColumn === undefined || editingHovered
      ? null
      : (() => {
          const content = cellTooltipContent(
            getCell(hoverCell.row, hoverColumn.id),
            hoverColumn.type,
            runs.runsRef.current.get(cellKey(hoverCell.row, hoverColumn.id)),
            labels,
            formatters,
          );
          if (content === null) return null;
          const viewport = viewportRef.current;
          return {
            content,
            anchor: {
              x: GUTTER_WIDTH + hoverCell.col * COL_WIDTH - viewport.scrollX,
              y: hoverCell.row * ROW_HEIGHT - viewport.scrollY,
              width: COL_WIDTH,
              height: ROW_HEIGHT,
            },
          };
        })();

  return {
    bodyCanvasRef: body.canvasRef,
    headerCanvasRef: header.canvasRef,
    scrollerRef,
    spacerRef,
    editor,
    runs,
    requestPaint,
    resetHover,
    gripAnchor,
    cellTooltip,
    clearHover,
    holdHover,
    ...pointer,
  };
}
