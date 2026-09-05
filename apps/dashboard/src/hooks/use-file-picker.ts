"use client";

import { type ChangeEvent, useRef } from "react";

/**
 * A hidden native file input behind a `Button`. Spread `inputProps` onto an
 * `<input>` (add `accept`/`id` as needed) and call `open()` from the button.
 *
 * The input's value is reset before `onPick` runs, so picking the same file
 * twice in a row still fires `change`.
 */
export function useFilePicker(onPick: (file: File) => void) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const inputProps = {
    ref: inputRef,
    type: "file" as const,
    className: "sr-only",
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (file) onPick(file);
    },
  };

  return { open: () => inputRef.current?.click(), inputProps };
}
