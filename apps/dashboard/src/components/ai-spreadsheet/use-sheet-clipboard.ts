"use client";

import type { ClipboardEvent } from "react";
import { parseCellInput } from "@/lib/ai-spreadsheet/cell-format";
import {
  MAX_CLIPBOARD_CELLS,
  parseTsv,
  selectionToTsv,
} from "@/lib/ai-spreadsheet/clipboard";
import { selectionRects } from "@/lib/ai-spreadsheet/run-targets";
import type { CellValue, SheetModel } from "@/lib/ai-spreadsheet/types";
import type { CellEditorApi } from "./use-cell-editor";

export type SheetClipboardHandlers = {
  onCopy: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onCut: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
};

/**
 * Excel-style clipboard for the grid, hung on the proxy textarea's own
 * clipboard events — synchronous, permissionless, and only in idle mode (an
 * in-progress edit keeps the textarea's native behaviour on the buffer).
 *
 * Copy writes the current selection rectangle as TSV; cut is copy plus an
 * immediate clear of the source; paste parses TSV (or a lone value) and
 * writes it anchored at the active cell, each value parsed by its target
 * column's type, overwriting what is there — one batched write, not a
 * request per cell.
 */
export function createClipboardHandlers(args: {
  modelRef: React.RefObject<SheetModel>;
  editor: CellEditorApi;
  setCells: (
    entries: { row: number; columnId: string; value: CellValue }[],
  ) => void;
  invalidateLayout: () => void;
  requestPaint: () => void;
}): SheetClipboardHandlers {
  const { modelRef, editor, setCells, invalidateLayout, requestPaint } = args;

  const editing = () => editor.editorRef.current.mode === "editing";

  /** The rectangle a copy serialises: the current (last) area. */
  const currentRect = () => {
    const rects = selectionRects(editor.editorRef.current);
    return rects[rects.length - 1] ?? null;
  };

  const onCopy = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (editing()) return;
    const model = modelRef.current;
    const rect = currentRect();
    if (!model || !rect) return;
    const tsv = selectionToTsv(model, rect);
    if (tsv === null) return;
    event.preventDefault();
    event.clipboardData.setData("text/plain", tsv);
  };

  const onCut = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (editing()) return;
    onCopy(event);
    // Simple cut: the source clears now, not on the later paste.
    editor.clearSelectedCells();
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (editing()) return;
    const model = modelRef.current;
    const active = editor.editorRef.current.active;
    if (!model || !active) return;
    const text = event.clipboardData.getData("text/plain");
    if (text === "") return;
    event.preventDefault();

    const grid = parseTsv(text);
    const entries: { row: number; columnId: string; value: CellValue }[] = [];
    for (let r = 0; r < grid.length; r++) {
      const line = grid[r] as string[];
      for (let c = 0; c < line.length; c++) {
        const col = active.col + c;
        const column = model.columns[col];
        if (!column) continue;
        const parsed = parseCellInput(line[c] as string, column.type);
        entries.push({
          row: active.row + r,
          columnId: column.id,
          value: parsed.value,
        });
        if (entries.length >= MAX_CLIPBOARD_CELLS) break;
      }
      if (entries.length >= MAX_CLIPBOARD_CELLS) break;
    }
    setCells(entries);
    invalidateLayout();
    requestPaint();
  };

  return { onCopy, onCut, onPaste };
}
