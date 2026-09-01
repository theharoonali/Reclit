"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCanvasSurface } from "@/hooks/use-canvas-surface";
import { dropTarget, previewOrder } from "@/lib/ai-spreadsheet/column-order";
import {
  COL_WIDTH,
  clamp,
  GUTTER_WIDTH,
  headerGripRect,
  ROW_HEIGHT,
} from "@/lib/ai-spreadsheet/geometry";
import { paintBody } from "@/lib/ai-spreadsheet/paint-body";
import type { CheckboxPaintState } from "@/lib/ai-spreadsheet/paint-checkbox";
import { paintEditor } from "@/lib/ai-spreadsheet/paint-editor";
import { paintHeader } from "@/lib/ai-spreadsheet/paint-header";
import type {
  CellValue,
  ColumnDragState,
  SheetFormatters,
  SheetHit,
  SheetLabels,
  SheetModel,
} from "@/lib/ai-spreadsheet/types";
import { useCellEditor } from "./use-cell-editor";
import { createColumnDragHandlers } from "./use-column-drag";
import { useSheetAudio } from "./use-sheet-audio";
import { createSheetPointerHandlers } from "./use-sheet-pointer";
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
  /** Row selection: the ticked set, its header state, and the toggles. */
  selectedRef: React.RefObject<Set<number>>;
  selectAllState: () => CheckboxPaintState;
  onToggleRow: (row: number) => void;
  onToggleAllRows: () => void;
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
  const { getCell, setCell } = args;
  const { onOpenJson, onOpenDate, onOpenAudio, onOpenFile, onOpenColumn } =
    args;
  const { onRemoveColumn, onReorderColumn, onSelectionPresence } = args;
  const { onBeforeColumnChange, dragChipRef, dragChipLabelRef } = args;
  const { selectedRef, selectAllState, onToggleRow, onToggleAllRows } = args;

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const spacerRef = useRef<HTMLDivElement | null>(null);
  const hoverRef = useRef<SheetHit>({ kind: "empty" });
  // A ref, never state: a drag repaints on every pointer move, and a
  // re-render would remount the canvas and blank it.
  const dragRef = useRef<ColumnDragState | null>(null);
  // The one piece of drag-adjacent React state. It flips only when the pointer
  // crosses onto or off a grip — not on the paint path — because a tooltip
  // needs a real DOM anchor and a real `open` prop.
  const [gripCol, setGripCol] = useState<number | null>(null);

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
        selected: selectedRef.current,
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
        selectAll: selectAllState(),
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
    selectAllState,
    selectedRef,
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
    getCell,
    requestPaint,
    onOpenJson,
    onOpenColumn,
    onRemoveColumn,
    onToggleAudio: audio.toggle,
    onToggleRow,
    onToggleAllRows,
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

  return {
    bodyCanvasRef: body.canvasRef,
    headerCanvasRef: header.canvasRef,
    scrollerRef,
    spacerRef,
    editor,
    requestPaint,
    resetHover,
    gripAnchor,
    ...pointer,
  };
}

export type SheetCanvasApi = ReturnType<typeof useSheetCanvas>;
