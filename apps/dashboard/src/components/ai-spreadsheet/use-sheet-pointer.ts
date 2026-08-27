"use client";

import type { MouseEvent } from "react";
import {
  fileLabel,
  isJsonObject,
  isResourceUrl,
} from "@/lib/ai-spreadsheet/cell-format";
import {
  cellRect,
  containsPoint,
  GUTTER_WIDTH,
  hitTest,
  hitTestHeader,
} from "@/lib/ai-spreadsheet/geometry";
import { AUDIO_LEADING, capsuleRect } from "@/lib/ai-spreadsheet/paint-cell";
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
  onToggleAudio: (row: number, columnId: string, url: string) => void;
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
  const { onOpenJson, onOpenColumn, onToggleAudio } = args;

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
      const chip = capsuleRect(ctx, cellRect(row, col), label, leading);
      return containsPoint(
        chip,
        x - GUTTER_WIDTH + viewport.scrollX,
        y + viewport.scrollY,
      );
    };

    const value = getCell(row, column.id);
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

    editor.selectCell(hit.row, hit.col);

    const target = capsuleTargetAt(hit.row, hit.col, x, y);
    if (!target) return;
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
