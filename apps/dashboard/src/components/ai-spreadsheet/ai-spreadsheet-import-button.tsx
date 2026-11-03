"use client";

import { useFilePicker } from "@/hooks/use-file-picker";
import { SHEET_FILE_ACCEPT } from "@/lib/ai-spreadsheet/import-file";
import { AiSpreadsheetHeaderAction } from "./ai-spreadsheet-header-action";
import { AiSpreadsheetImportDialog } from "./ai-spreadsheet-import-dialog";
import type { SheetImport } from "./use-sheet-import";

type AiSpreadsheetImportButtonProps = {
  importer: SheetImport;
  /** Already resolved to copy — this component maps no error codes. */
  errorMessage: string | null;
  labels: { import: string; reading: string; importing: string };
};

/**
 * The Import control: the shared header action with a hidden file input
 * riding along, and the preview dialog a picked file opens. It owns no
 * mutation — `useSheetImport` in the grid decides the order in which an
 * import flushes pending writes and refreshes the model.
 */
export function AiSpreadsheetImportButton(
  props: AiSpreadsheetImportButtonProps,
) {
  const { importer } = props;
  const picker = useFilePicker(importer.pick);
  const busy = importer.status === "reading" || importer.status === "importing";
  const label =
    importer.status === "reading"
      ? props.labels.reading
      : importer.status === "importing"
        ? props.labels.importing
        : props.labels.import;

  return (
    <AiSpreadsheetHeaderAction
      disabled={busy || importer.pending !== null}
      errorMessage={props.errorMessage}
      label={label}
      onClick={picker.open}
      variant="outline"
    >
      <input accept={SHEET_FILE_ACCEPT} {...picker.inputProps} />
      {importer.pending && (
        <AiSpreadsheetImportDialog
          fileName={importer.pending.file.name}
          importing={importer.status === "importing"}
          onCancel={importer.cancel}
          onConfirm={importer.confirm}
          preview={importer.pending.preview}
        />
      )}
    </AiSpreadsheetHeaderAction>
  );
}
