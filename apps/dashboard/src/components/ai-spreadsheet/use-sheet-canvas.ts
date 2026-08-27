"use client";

import { useCallback, useEffect, useRef } from "react";
import { useCanvasSurface } from "@/hooks/use-canvas-surface";
import {
  COL_WIDTH,
  clamp,
  GUTTER_WIDTH,
  ROW_HEIGHT,
} from "@/lib/ai-spreadsheet/geometry";
import { paintBody } from "@/lib/ai-spreadsheet/paint-body";
import { paintEditor } from "@/lib/ai-spreadsheet/paint-editor";
import { paintHeader } from "@/lib/ai-spreadsheet/paint-header";
import type {
  CellValue,
  SheetFormatters,
  SheetHit,
  SheetLabels,
  SheetModel,
} from "@/lib/ai-spreadsheet/types";
import { useCellEditor } from "./use-cell-editor";
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
  onOpenColumn: (columnId?: string) => void;
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
  const { onOpenJson, onOpenDate, onOpenColumn } = args;

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const spacerRef = useRef<HTMLDivElement | null>(null);
  const hoverRef = useRef<SheetHit>({ kind: "empty" });

  const view = useSheetViewport(
    rowCount,
    modelRef.current?.columns.length ?? 0,
  );
  const { viewportRef, paletteRef, fontsRef, paintRef, requestPaint } = view;

  const { syncGeometry, scrollCellIntoView } = useSheetScroll({
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
  });
  const { editorRef, proxyRef } = editor;

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
        columns: model.columns,
        palette: paletteRef.current,
        labels,
        fonts: fontsRef.current,
        hover: hoverRef.current,
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
    getCell,
    requestPaint,
    onOpenJson,
    onOpenColumn,
    onToggleVoice: audio.toggle,
  });

  return {
    bodyCanvasRef: body.canvasRef,
    headerCanvasRef: header.canvasRef,
    scrollerRef,
    spacerRef,
    editor,
    requestPaint,
    ...pointer,
  };
}

export type SheetCanvasApi = ReturnType<typeof useSheetCanvas>;
