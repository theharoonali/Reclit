"use client";

import { useCallback, useEffect, useRef } from "react";
import { editableText, parseCellInput } from "@/lib/ai-spreadsheet/cell-format";
import { CELL_PAD_X, COL_WIDTH, clamp } from "@/lib/ai-spreadsheet/geometry";
import { caretXForIndex } from "@/lib/ai-spreadsheet/text-metrics";
import type {
  CellValue,
  EditorState,
  SheetFonts,
  SheetModel,
  Viewport,
} from "@/lib/ai-spreadsheet/types";

const BLINK_MS = 530;

const IDLE: EditorState = {
  active: null,
  mode: "idle",
  buffer: "",
  caret: 0,
  selection: [0, 0],
  innerScrollX: 0,
  caretVisible: true,
};

export type MoveDirection = "up" | "down" | "left" | "right" | "none";

const DELTAS: Record<MoveDirection, [number, number]> = {
  up: [-1, 0],
  down: [1, 0],
  left: [0, -1],
  right: [0, 1],
  none: [0, 0],
};

export type CellEditorArgs = {
  modelRef: React.RefObject<SheetModel>;
  viewportRef: React.RefObject<Viewport>;
  /** The body canvas context, used only to measure text for the caret. */
  ctxRef: React.RefObject<CanvasRenderingContext2D | null>;
  fontsRef: React.RefObject<SheetFonts>;
  getCell: (row: number, columnId: string) => CellValue;
  setCell: (row: number, columnId: string, value: CellValue) => void;
  requestPaint: () => void;
  scrollCellIntoView: (row: number, col: number) => void;
  onOpenJson: (row: number, columnId: string) => void;
  onOpenDate: (row: number, columnId: string) => void;
  onOpenAudio: (row: number, columnId: string) => void;
  onOpenFile: (row: number, columnId: string) => void;
};

/**
 * The cell editing state machine.
 *
 * There is no DOM input on the grid. A hidden textarea holds focus and is the
 * only thing that ever sees a keystroke; this hook mirrors its value, caret
 * and selection into `editorRef`, and the painters draw them. Letting the
 * textarea own the caret rather than computing it by hand is what buys IME,
 * paste, drag-drop text and the browser's own undo for free.
 */
export function useCellEditor(args: CellEditorArgs) {
  const editorRef = useRef<EditorState>({ ...IDLE });
  const proxyRef = useRef<HTMLTextAreaElement | null>(null);
  const blinkRef = useRef(0);

  const { modelRef, viewportRef, ctxRef, fontsRef, requestPaint } = args;
  const { getCell, setCell, scrollCellIntoView } = args;
  const { onOpenJson, onOpenDate, onOpenAudio, onOpenFile } = args;

  const stopBlink = useCallback(() => {
    if (blinkRef.current !== 0) window.clearInterval(blinkRef.current);
    blinkRef.current = 0;
  }, []);

  /** Restarted on every keystroke so the caret never blinks mid-typing. */
  const restartBlink = useCallback(() => {
    stopBlink();
    editorRef.current.caretVisible = true;
    blinkRef.current = window.setInterval(() => {
      editorRef.current.caretVisible = !editorRef.current.caretVisible;
      requestPaint();
    }, BLINK_MS);
  }, [requestPaint, stopBlink]);

  useEffect(() => stopBlink, [stopBlink]);

  const columnAt = useCallback(
    (col: number) => modelRef.current?.columns[col],
    [modelRef],
  );

  /** Keeps the caret inside the cell by scrolling the text under the clip. */
  const refreshCaretMetrics = useCallback(() => {
    const ctx = ctxRef.current;
    const editor = editorRef.current;
    if (!ctx) return;
    ctx.font = fontsRef.current.cell;
    const caretX = caretXForIndex(ctx, editor.buffer, editor.caret);
    const inner = COL_WIDTH - CELL_PAD_X * 2;
    if (caretX - editor.innerScrollX > inner) {
      editor.innerScrollX = caretX - inner;
    }
    if (caretX - editor.innerScrollX < 0) editor.innerScrollX = caretX;
    editor.innerScrollX = Math.max(0, editor.innerScrollX);
  }, [ctxRef, fontsRef]);

  const focusProxy = useCallback(() => {
    proxyRef.current?.focus({ preventScroll: true });
  }, []);

  const resetProxy = useCallback((text: string) => {
    const proxy = proxyRef.current;
    if (!proxy) return;
    proxy.value = text;
    proxy.setSelectionRange(text.length, text.length);
  }, []);

  /**
   * Writes an in-progress edit back to its cell and returns the editor to
   * idle. A buffer identical to the cell's editable text is not a change and
   * writes nothing — so wandering focus never fires spurious mutations. An
   * unparseable entry is kept as the raw string and painted as invalid —
   * never silently thrown away.
   */
  const commitPending = useCallback(() => {
    const editor = editorRef.current;
    const active = editor.active;
    if (!active || editor.mode !== "editing") return;
    const column = columnAt(active.col);
    if (column) {
      const before = editableText(getCell(active.row, column.id), column.type);
      if (editor.buffer !== before) {
        const parsed = parseCellInput(editor.buffer, column.type);
        setCell(active.row, column.id, parsed.value);
      }
    }
    stopBlink();
    editorRef.current = { ...IDLE, active };
    resetProxy("");
  }, [columnAt, getCell, resetProxy, setCell, stopBlink]);

  // Commits before moving: clicking another cell mid-edit saves the edit —
  // pressing Enter first is not required, and Escape still discards.
  const selectCell = useCallback(
    (row: number, col: number) => {
      commitPending();
      stopBlink();
      editorRef.current = { ...IDLE, active: { row, col } };
      resetProxy("");
      focusProxy();
      requestPaint();
    },
    [commitPending, focusProxy, requestPaint, resetProxy, stopBlink],
  );

  const beginEdit = useCallback(
    (row: number, col: number, seed?: string) => {
      const column = columnAt(col);
      if (!column) return;
      // JSON is never edited as text in the cell — the side panel owns it.
      if (column.type === "json") {
        selectCell(row, col);
        onOpenJson(row, column.id);
        return;
      }

      // A date opens the panel's calendar, but only when the edit was asked
      // for rather than typed into: a seed means the user started typing a
      // date, and swallowing those keystrokes would be a surprise.
      if (column.type === "date" && seed === undefined) {
        selectCell(row, col);
        onOpenDate(row, column.id);
        return;
      }

      // An audio cell's asked-for edit opens the upload panel — the chip's
      // single click already plays, so Enter/F2/double-click manage the file
      // instead. Typing still edits the URL (a seed skips the panel).
      if (column.type === "audio" && seed === undefined) {
        selectCell(row, col);
        onOpenAudio(row, column.id);
        return;
      }

      // A file cell works like audio: the chip's single click already opens
      // the URL, so an asked-for edit opens the upload panel instead of a
      // text editor. Typing still edits the URL (a seed skips the panel),
      // Delete still clears.
      if (column.type === "file" && seed === undefined) {
        selectCell(row, col);
        onOpenFile(row, column.id);
        return;
      }

      // A boolean has two states and no text, so an asked-for edit is a
      // toggle. Typing is not a toggle: a keystroke that arrives as a seed
      // opens the text editor instead, because silently flipping a value
      // because someone started typing would be a nasty surprise. A mistyped
      // value falls through too, so it can still be corrected by hand.
      if (column.type === "boolean" && seed === undefined) {
        const current = getCell(row, column.id);
        if (typeof current === "boolean" || current === null) {
          setCell(row, column.id, current !== true);
          selectCell(row, col);
          return;
        }
      }

      const text = seed ?? editableText(getCell(row, column.id), column.type);
      editorRef.current = {
        active: { row, col },
        mode: "editing",
        buffer: text,
        caret: text.length,
        selection: [text.length, text.length],
        innerScrollX: 0,
        caretVisible: true,
      };
      resetProxy(text);
      focusProxy();
      refreshCaretMetrics();
      restartBlink();
      requestPaint();
    },
    [
      columnAt,
      focusProxy,
      getCell,
      onOpenAudio,
      onOpenDate,
      onOpenFile,
      onOpenJson,
      refreshCaretMetrics,
      requestPaint,
      resetProxy,
      restartBlink,
      selectCell,
      setCell,
    ],
  );

  const moveActive = useCallback(
    (deltaRow: number, deltaCol: number) => {
      const active = editorRef.current.active;
      const viewport = viewportRef.current;
      if (!active || !viewport) return;
      const row = clamp(active.row + deltaRow, 0, viewport.rowExtent - 1);
      const col = clamp(active.col + deltaCol, 0, viewport.columnCount - 1);
      selectCell(row, col);
      scrollCellIntoView(row, col);
    },
    [scrollCellIntoView, selectCell, viewportRef],
  );

  const commit = useCallback(
    (move: MoveDirection) => {
      if (editorRef.current.mode !== "editing") return;
      commitPending();

      const [deltaRow, deltaCol] = DELTAS[move];
      if (deltaRow !== 0 || deltaCol !== 0) moveActive(deltaRow, deltaCol);
      else requestPaint();
    },
    [commitPending, moveActive, requestPaint],
  );

  const cancel = useCallback(() => {
    const active = editorRef.current.active;
    stopBlink();
    editorRef.current = { ...IDLE, active };
    resetProxy("");
    requestPaint();
  }, [requestPaint, resetProxy, stopBlink]);

  /** `input` and `select` on the hidden textarea both land here. */
  const syncFromProxy = useCallback(() => {
    const proxy = proxyRef.current;
    const editor = editorRef.current;
    if (!proxy || editor.mode !== "editing") return;
    editor.buffer = proxy.value;
    editor.caret = proxy.selectionStart ?? proxy.value.length;
    editor.selection = [proxy.selectionStart ?? 0, proxy.selectionEnd ?? 0];
    refreshCaretMetrics();
    restartBlink();
    requestPaint();
  }, [refreshCaretMetrics, requestPaint, restartBlink]);

  const clearActiveCell = useCallback(() => {
    const active = editorRef.current.active;
    const column = active ? columnAt(active.col) : undefined;
    if (!active || !column) return;
    setCell(active.row, column.id, null);
    requestPaint();
  }, [columnAt, requestPaint, setCell]);

  return {
    editorRef,
    proxyRef,
    selectCell,
    beginEdit,
    commit,
    cancel,
    moveActive,
    syncFromProxy,
    clearActiveCell,
    focusProxy,
  };
}

export type CellEditorApi = ReturnType<typeof useCellEditor>;
