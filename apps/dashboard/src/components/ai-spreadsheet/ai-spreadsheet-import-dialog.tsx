"use client";

import { Button } from "@reclit/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@reclit/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@reclit/ui/table";
import { useTranslations } from "next-intl";
import type {
  ImportTarget,
  SheetImportPreview,
} from "@/lib/ai-spreadsheet/import-file";
import { AiSpreadsheetImportSample } from "./ai-spreadsheet-import-sample";

type AiSpreadsheetImportDialogProps = {
  fileName: string;
  preview: SheetImportPreview;
  importing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * The read-only preview an import opens before writing anything: where each
 * file column lands (an existing column it fills, or a new one) and the first
 * rows exactly as they will be stored. Confirm merges; Cancel leaves the sheet
 * untouched.
 */
export function AiSpreadsheetImportDialog(
  props: AiSpreadsheetImportDialogProps,
) {
  const t = useTranslations("aiSpreadsheet.import.preview");
  const tTypes = useTranslations("aiSpreadsheet.types");
  const { preview } = props;
  const rows = preview.rowCount;

  const targetLabel = (target: ImportTarget) =>
    target.kind === "existing"
      ? t("existing", { name: target.name })
      : t("new", { type: tTypes(target.type) });

  return (
    <Dialog
      onOpenChange={(open) => !open && !props.importing && props.onCancel()}
      open
    >
      <DialogContent className="max-w-import-dialog">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">
            {t("title", { name: props.fileName })}
          </DialogTitle>
          <DialogDescription>
            {preview.tableCount > 1
              ? t("summaryTables", { rows, tables: preview.tableCount })
              : t("summary", { rows })}
          </DialogDescription>
        </DialogHeader>

        <section className="grid min-w-0 gap-2">
          <h3 className="text-label text-foreground">{t("columnsTitle")}</h3>
          <div className="max-h-import-section overflow-auto rounded-sm border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("fileColumn")}</TableHead>
                  <TableHead>{t("target")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.columns.map((column) => (
                  <TableRow key={column.source}>
                    <TableCell>{column.source}</TableCell>
                    <TableCell>
                      <span
                        className={
                          column.target.kind === "new"
                            ? "text-muted-foreground"
                            : "text-foreground"
                        }
                      >
                        {targetLabel(column.target)}
                      </span>
                      {column.skippedValues > 0 && (
                        <p className="text-caption text-destructive">
                          {t("skipped", { count: column.skippedValues })}
                        </p>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>

        {preview.sampleRows.length > 0 && (
          <AiSpreadsheetImportSample
            preview={preview}
            title={t("sampleTitle", { count: preview.sampleRows.length })}
          />
        )}

        <DialogFooter>
          <Button
            disabled={props.importing}
            onClick={props.onCancel}
            type="button"
            variant="ghost"
          >
            {t("cancel")}
          </Button>
          <Button
            disabled={props.importing}
            onClick={props.onConfirm}
            type="button"
          >
            {t("confirm", { rows })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
