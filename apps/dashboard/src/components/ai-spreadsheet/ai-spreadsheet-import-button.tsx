"use client";

import { Button } from "@reclit/ui/button";
import { Upload } from "lucide-react";
import { useRef } from "react";
import { HeaderActions } from "@/components/layout/header-actions";
import type { ImportStatus } from "./use-sheet-import";

type AiSpreadsheetImportButtonProps = {
  status: ImportStatus;
  /** Already resolved to copy — this component maps no error codes. */
  errorMessage: string | null;
  labels: { import: string; importing: string };
  onPick: (file: File) => void;
};

/**
 * The Import control, portalled into the app header so the sheet keeps the
 * whole content area (`docs/rules/FRONTEND.md` — pages put controls in the
 * header rather than growing their own bar).
 *
 * Purely presentational: it owns no mutation, so the grid keeps control of the
 * order in which an import discards pending writes and refreshes the model.
 */
export function AiSpreadsheetImportButton(
  props: AiSpreadsheetImportButtonProps,
) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <HeaderActions>
      {props.errorMessage && (
        <p
          className="hidden max-w-xs truncate text-caption text-destructive sm:block"
          role="alert"
        >
          {props.errorMessage}
        </p>
      )}

      <input
        accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Reset first, so picking the same file again still fires `change`.
          event.target.value = "";
          if (file) props.onPick(file);
        }}
        ref={inputRef}
        type="file"
      />

      <Button
        disabled={props.status === "importing"}
        onClick={() => inputRef.current?.click()}
        size="sm"
        type="button"
        variant="outline"
      >
        <Upload aria-hidden="true" />
        {props.status === "importing"
          ? props.labels.importing
          : props.labels.import}
      </Button>
    </HeaderActions>
  );
}
