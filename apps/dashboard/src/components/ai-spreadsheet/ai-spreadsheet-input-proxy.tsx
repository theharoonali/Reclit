"use client";

import { type KeyboardEvent, useRef } from "react";
import type { CellEditorApi } from "./use-cell-editor";

type AiSpreadsheetInputProxyProps = {
  editor: CellEditorApi;
  label: string;
};

/**
 * The only focusable element in the grid, and the only thing that ever sees a
 * keystroke. It is a real `<textarea>` — invisible, one pixel square, parked
 * over the active cell — because a canvas cannot receive keyboard, clipboard
 * or IME input on its own.
 *
 * It is positioned at the active cell rather than off-screen for two reasons:
 * the IME candidate window renders wherever the field is, and an off-screen
 * field makes the browser scroll the container to it on focus.
 *
 * Deliberately no blur handler. Re-focusing on blur is the usual trick for
 * keeping a canvas grid "hot", but it fights every other focusable thing on
 * the page — the side panel's own inputs first of all. Focus comes back on
 * the next pointerdown on the canvas instead.
 */
export function AiSpreadsheetInputProxy(props: AiSpreadsheetInputProxyProps) {
  const { editor, label } = props;
  const composingRef = useRef(false);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Never intercept keys mid-composition: the IME owns them.
    if (composingRef.current) return;
    const state = editor.editorRef.current;
    const active = state.active;
    if (!active) return;
    const back = event.shiftKey;

    if (state.mode === "editing") {
      switch (event.key) {
        case "Enter":
          event.preventDefault();
          editor.commit(back ? "up" : "down");
          return;
        case "Tab":
          event.preventDefault();
          editor.commit(back ? "left" : "right");
          return;
        case "Escape":
          event.preventDefault();
          editor.cancel();
          return;
        case "ArrowUp":
          event.preventDefault();
          editor.commit("up");
          return;
        case "ArrowDown":
          event.preventDefault();
          editor.commit("down");
          return;
        default:
          // Everything else — including left/right, which move the caret —
          // belongs to the textarea. `onSelect` mirrors the result back.
          return;
      }
    }

    switch (event.key) {
      case "Enter":
      case "F2":
        event.preventDefault();
        editor.beginEdit(active.row, active.col);
        return;
      case "Tab":
        event.preventDefault();
        editor.moveActive(0, back ? -1 : 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        editor.moveActive(-1, 0);
        return;
      case "ArrowDown":
        event.preventDefault();
        editor.moveActive(1, 0);
        return;
      case "ArrowLeft":
        event.preventDefault();
        editor.moveActive(0, -1);
        return;
      case "ArrowRight":
        event.preventDefault();
        editor.moveActive(0, 1);
        return;
      case "Delete":
      case "Backspace":
        event.preventDefault();
        editor.clearActiveCell();
        return;
      default:
        break;
    }

    // A printable key starts an edit. `preventDefault` is deliberately NOT
    // called: the textarea inserts the character itself, so dead keys,
    // accents and IME all behave exactly as they would in a normal field.
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      editor.beginEdit(active.row, active.col, "");
    }
  };

  return (
    <textarea
      ref={editor.proxyRef}
      aria-label={label}
      autoCapitalize="off"
      autoCorrect="off"
      className="absolute left-0 top-0 h-px w-px resize-none overflow-hidden rounded-none border-0 bg-transparent p-0 text-body text-transparent caret-transparent outline-none"
      onCompositionEnd={() => {
        composingRef.current = false;
        editor.syncFromProxy();
      }}
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onInput={editor.syncFromProxy}
      onKeyDown={handleKeyDown}
      onSelect={editor.syncFromProxy}
      spellCheck={false}
    />
  );
}
