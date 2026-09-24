"use client";

import { FileImportIcon } from "@hugeicons/core-free-icons";
import { useFilePicker } from "@/hooks/use-file-picker";
import { SHEET_FILE_ACCEPT } from "@/lib/ai-spreadsheet/import-file";
import { AiSpreadsheetHeaderAction } from "./ai-spreadsheet-header-action";
import type { ImportStatus } from "./use-sheet-import";

type AiSpreadsheetImportButtonProps = {
  status: ImportStatus;
  /** Already resolved to copy — this component maps no error codes. */
  errorMessage: string | null;
  labels: { import: string; importing: string };
  onPick: (file: File) => void;
};

/**
 * The Import control: the shared header action with a hidden file input
 * riding along. Purely presentational — it owns no mutation, so the grid keeps
 * control of the order in which an import discards pending writes and
 * refreshes the model.
 */
export function AiSpreadsheetImportButton(
  props: AiSpreadsheetImportButtonProps,
) {
  const picker = useFilePicker(props.onPick);
  const importing = props.status === "importing";

  return (
    <AiSpreadsheetHeaderAction
      disabled={importing}
      errorMessage={props.errorMessage}
      icon={FileImportIcon}
      iconOnly
      label={importing ? props.labels.importing : props.labels.import}
      onClick={picker.open}
      variant="outline"
    >
      <input accept={SHEET_FILE_ACCEPT} {...picker.inputProps} />
    </AiSpreadsheetHeaderAction>
  );
}
