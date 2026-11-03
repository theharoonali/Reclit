"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCanvasSurface } from "@/hooks/use-canvas-surface";
import { dropTarget, previewOrder } from "@/lib/ai-spreadsheet/column-order";
import {
  CELL_PAD_X,
  clamp,
  GUTTER_WIDTH,
  headerGripRect,
  hitTest,
} from "@/lib/ai-spreadsheet/geometry";
import {
  buildLayout,
  CELL_PAD_Y,
  colLeft,
  colWidth,
  LINE_HEIGHT,
  rowHeight,
  rowTop,
  wrapLines,
} from "@/lib/ai-spreadsheet/layout";
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
import { createClipboardHandlers } from "./use-sheet-clipboard";
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
  /** A paste's bulk write — one batched request (use-sheet-sync `setCells`). */
  setCells: (
    entries: { row: number; columnId: string; value: CellValue }[],
  ) => void;
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
  const { getCell } = args;
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

  const view = useSheetViewport(
    rowCount,
    modelRef.current?.columns.length ?? 0,
  );
  const {
    viewportRef,
    paletteRef,
    fontsRef,
    paintRef,
    requestPaint,
    layoutDirtyRef,
    invalidateLayout,
  } = view;

  // The selected cell's in-place scroller: wheel-driven, reset when the
  // active cell changes. A ref-of-ref so the wheel listener never re-binds
  // while the real implementation (below, needing the editor) swaps in.
  const activeCellScrollRef = useRef({ key: "", y: 0 });
  const cellWheelRef = useRef<(x: number, y: number, dy: number) => boolean>(
    () => false,
  );

  const { syncGeometry, scrollCellIntoView, scrollBy } = useSheetScroll({
    scrollerRef,
    spacerRef,
    viewportRef,
    requestPaint,
    interceptWheel: (x, y, dy) => cellWheelRef.current(x, y, dy),
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

  // Any cell write can change a fitted width or a grown row height, so both
  // write paths carry the layout invalidation with them.
  const lastCellCountRef = useRef(-1);
  const setCell = useCallback<SheetCanvasArgs["setCell"]>(
    (row, columnId, value) => {
      args.setCell(row, columnId, value);
      invalidateLayout();
    },
    [args.setCell, invalidateLayout],
  );
  const setCellLocal = useCallback<SheetCanvasArgs["setCellLocal"]>(
    (row, columnId, value) => {
      args.setCellLocal(row, columnId, value);
      invalidateLayout();
    },
    [args.setCellLocal, invalidateLayout],
  );

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

  const clipboard = createClipboardHandlers({
    modelRef,
    editor,
    setCells: args.setCells,
    invalidateLayout,
    requestPaint,
  });

  /** True when the selected idle cell can scroll its own content. */
  const activeScrollable = useCallback((): {
    row: number;
    col: number;
    max: number;
  } | null => {
    const model = modelRef.current;
    const state = editorRef.current;
    const ctx = bodyCtxRef.current;
    const active = state.active;
    if (!model || !ctx || !active || state.mode !== "idle") return null;
    const column = model.columns[active.col];
    if (!column || column.type !== "string" || column.node === "email") {
      return null;
    }
    const value = model.cells.get(cellKey(active.row, column.id));
    if (typeof value !== "string") return null;
    const { layout } = viewportRef.current;
    ctx.font = fontsRef.current.cell;
    const inner = colWidth(layout, active.col) - CELL_PAD_X * 2;
    const lines = wrapLines(ctx, value, inner, 1_000).length;
    const contentH = lines * LINE_HEIGHT + CELL_PAD_Y * 2;
    const max = contentH - rowHeight(layout, active.row);
    return max > 0 ? { row: active.row, col: active.col, max } : null;
  }, [bodyCtxRef, editorRef, fontsRef, modelRef, viewportRef]);

  cellWheelRef.current = (x, y, dy) => {
    const scrollable = activeScrollable();
    if (!scrollable) return false;
    const hit = hitTest(x, y, viewportRef.current);
    if (
      hit.kind !== "cell" ||
      hit.row !== scrollable.row ||
      hit.col !== scrollable.col
    ) {
      return false;
    }
    const state = activeCellScrollRef.current;
    const key = `${scrollable.row}:${scrollable.col}`;
    if (state.key !== key) {
      state.key = key;
      state.y = 0;
    }
    const next = clamp(state.y + dy, 0, scrollable.max);
    // At either end the wheel falls through, so the sheet keeps scrolling.
    if (next === state.y) return false;
    state.y = next;
    requestPaint();
    return true;
  };

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
  }, []);

  /** Parks the hidden textarea over the active cell — see the proxy's docs. */
  const positionProxy = useCallback(() => {
    const proxy = proxyRef.current;
    const active = editorRef.current.active;
    const viewport = viewportRef.current;
    if (!proxy || !active) return;
    const { layout } = viewport;
    const x = GUTTER_WIDTH + colLeft(layout, active.col) - viewport.scrollX;
    const y = rowTop(layout, active.row) - viewport.scrollY;
    proxy.style.left = `${clamp(x, 0, Math.max(0, viewport.width - 1))}px`;
    proxy.style.top = `${clamp(y, 0, Math.max(0, viewport.height - 1))}px`;
  }, [editorRef, proxyRef, viewportRef]);

  const paint = useCallback(() => {
    const model = modelRef.current;
    const viewport = viewportRef.current;
    if (!model) return;
    viewport.columnCount = model.columns.length;

    // The layout is rebuilt here, never per frame: only when something
    // marked it dirty (a cell write, a column change, a font load) or the
    // sparse cell count moved under us (a removal path without its own
    // invalidate). Everything below this line paints from one layout.
    const layoutCtx = bodyCtxRef.current;
    if (
      layoutCtx &&
      (layoutDirtyRef.current ||
        viewport.layout.colLefts.length - 1 !== model.columns.length ||
        lastCellCountRef.current !== model.cells.size)
    ) {
      viewport.layout = buildLayout({
        ctx: layoutCtx,
        columns: model.columns,
        cells: model.cells,
        labels,
        formatters,
        fonts: {
          cell: fontsRef.current.cell,
          header: fontsRef.current.header,
        },
      });
      layoutDirtyRef.current = false;
      lastCellCountRef.current = model.cells.size;
      // The content size changed with the layout, so the spacer and the
      // scroll clamps must follow before anything paints.
      syncGeometry();
    }

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
      // The selected cell's scroller: visible (thumb at rest) as soon as a
      // scrollable cell is selected, offset by whatever the wheel has done.
      const scrollable = activeScrollable();
      let activeCellScrollY: number | undefined;
      if (scrollable) {
        const state = activeCellScrollRef.current;
        const key = `${scrollable.row}:${scrollable.col}`;
        if (state.key !== key) {
          state.key = key;
          state.y = 0;
        }
        state.y = Math.min(state.y, scrollable.max);
        activeCellScrollY = state.y;
      }
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
        activeCellScrollY,
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

  // Adding a column widens the content, so the spacer has to grow with it —
  // and any column change (name, type, order) re-fits the layout.
  useEffect(() => {
    const model = modelRef.current;
    if (model) viewportRef.current.columnCount = model.columns.length;
    invalidateLayout();
    syncGeometry();
    requestPaint();
  }, [
    columnsVersion,
    invalidateLayout,
    modelRef,
    requestPaint,
    syncGeometry,
    viewportRef,
  ]);

  const pointer = createSheetPointerHandlers({
    modelRef,
    viewportRef,
    ctxRef: bodyCtxRef,
    fontsRef,
    hoverRef,
    editor,
    drag: columnDrag,
    onGripHover: setGripCol,
    getCell,
    requestPaint,
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
            headerGripRect(viewportRef.current.layout, gripCol).x -
            viewportRef.current.scrollX,
          y: headerGripRect(viewportRef.current.layout, gripCol).y,
        };

  return {
    bodyCanvasRef: body.canvasRef,
    headerCanvasRef: header.canvasRef,
    scrollerRef,
    spacerRef,
    editor,
    runs,
    clipboard,
    requestPaint,
    invalidateLayout,
    resetHover,
    gripAnchor,
    ...pointer,
  };
}
