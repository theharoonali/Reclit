"use client";

import { type ChangeEvent, useRef } from "react";

/**
 * A hidden native file input behind a `Button`. Spread `inputProps` onto an
 * `<input>` (add `accept`/`id` as needed) and call `open()` from the button.
 *
 * The input's value is reset before `onPick` runs, so picking the same file
 * twice in a row still fires `change`. With `multiple`, the dialog takes
 * several files and `onPick` runs once per file, in the order picked.
 */
export function useFilePicker(
  onPick: (file: File) => void,
  { multiple = false }: { multiple?: boolean } = {},
) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const inputProps = {
    ref: inputRef,
    type: "file" as const,
    className: "sr-only",
    multiple,
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = "";
      for (const file of multiple ? files : files.slice(0, 1)) onPick(file);
    },
  };

  return { open: () => inputRef.current?.click(), inputProps };
}
