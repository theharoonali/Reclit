"use client";

import type { MouseEvent } from "react";
import { isJsonObject } from "@/lib/ai-spreadsheet/cell-format";
import {
  cellRect,
  containsPoint,
  GUTTER_WIDTH,
  hitTest,
  hitTestHeader,
} from "@/lib/ai-spreadsheet/geometry";
import { capsuleRect } from "@/lib/ai-spreadsheet/paint-cell";
import type {
  CellValue,
  SheetFonts,
  SheetHit,
  SheetLabels,
  SheetModel,
  Viewport,
} from "@/lib/ai-spreadsheet/types";
import type { CellEditorApi } from "./use-cell-editor";

export type SheetPointerArgs = {
  modelRef: React.RefObject<SheetModel>;
  viewportRef: React.RefObject<Viewport>;
  ctxRef: React.RefObject<CanvasRenderingContext2D | null>;
  fontsRef: React.RefObject<SheetFonts>;
  /** Which column (if any) the pointer is over, for the header highlight. */
  hoverRef: React.RefObject<SheetHit>;
  labels: SheetLabels;
  editor: CellEditorApi;
  getCell: (row: number, columnId: string) => CellValue;
  requestPaint: () => void;
  onOpenJson: (row: number, columnId: string) => void;
  onOpenColumn: (columnId?: string) => void;
};

/**
 * Turns pointer events on the two canvases into sheet actions.
 *
 * Not a hook — no state of its own, just a bundle of handlers over the refs it
 * is given. It is separate from `use-sheet-canvas.ts` because hit-testing and
 * painting are different jobs that happen to share a coordinate system.
 */
export function createSheetPointerHandlers(args: SheetPointerArgs) {
  const { modelRef, viewportRef, ctxRef, fontsRef, hoverRef } = args;
  const { labels, editor, getCell, requestPaint } = args;
  const { onOpenJson, onOpenColumn } = args;

  /** Canvas-relative CSS pixels. DPR never enters this — see `geometry`. */
  const localPoint = (event: MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  /**
   * True when the pointer landed on a JSON cell's capsule chip. It calls the
   * same `capsuleRect` the painter used, so the chip you can click is by
   * construction the chip that was drawn.
   */
  const hitCapsule = (row: number, col: number, x: number, y: number) => {
    const ctx = ctxRef.current;
    const column = modelRef.current?.columns[col];
    const viewport = viewportRef.current;
    if (!ctx || !column || !viewport || column.type !== "json") return false;
    const value = getCell(row, column.id);
    if (!isJsonObject(value)) return false;
    ctx.font = fontsRef.current.cell;
    const label = labels.jsonCapsule(Object.keys(value).length);
    const chip = capsuleRect(ctx, cellRect(row, col), label);
    return containsPoint(
      chip,
      x - GUTTER_WIDTH + viewport.scrollX,
      y + viewport.scrollY,
    );
  };

  const handleBodyPointerDown = (event: MouseEvent<HTMLDivElement>) => {
    const { x, y } = localPoint(event);
    // Kills the text-selection drag. It also cancels the focus the click would
    // have given us, which is why the editor re-focuses the proxy explicitly.
    event.preventDefault();
    const hit = hitTest(x, y, viewportRef.current);
    if (hit.kind !== "cell") {
      editor.focusProxy();
      return;
    }
    const column = modelRef.current?.columns[hit.col];
    if (column && hitCapsule(hit.row, hit.col, x, y)) {
      editor.selectCell(hit.row, hit.col);
      onOpenJson(hit.row, column.id);
      return;
    }
    editor.selectCell(hit.row, hit.col);
  };

  const handleBodyDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    const { x, y } = localPoint(event);
    const hit = hitTest(x, y, viewportRef.current);
    if (hit.kind === "cell") editor.beginEdit(hit.row, hit.col);
  };

  const handleHeaderPointerDown = (event: MouseEvent<HTMLDivElement>) => {
    const hit = hitTestHeader(localPoint(event).x, viewportRef.current);
    if (hit.kind === "plus") onOpenColumn();
    else if (hit.kind === "header") {
      onOpenColumn(modelRef.current?.columns[hit.col]?.id);
    }
  };

  const handleHeaderPointerMove = (event: MouseEvent<HTMLDivElement>) => {
    const hit = hitTestHeader(localPoint(event).x, viewportRef.current);
    const previous = hoverRef.current;
    const sameColumn =
      hit.kind !== "header" ||
      (previous.kind === "header" && hit.col === previous.col);
    if (hit.kind === previous.kind && sameColumn) return;
    hoverRef.current = hit;
    requestPaint();
  };

  const handleHeaderPointerLeave = () => {
    if (hoverRef.current.kind === "empty") return;
    hoverRef.current = { kind: "empty" };
    requestPaint();
  };

  return {
    handleBodyPointerDown,
    handleBodyDoubleClick,
    handleHeaderPointerDown,
    handleHeaderPointerMove,
    handleHeaderPointerLeave,
  };
}
