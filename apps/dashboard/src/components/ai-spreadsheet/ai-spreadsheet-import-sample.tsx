"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@reclit/ui/table";
import { editableText } from "@/lib/ai-spreadsheet/cell-format";
import type { SheetImportPreview } from "@/lib/ai-spreadsheet/import-file";

/**
 * The import preview's first rows, headed by the sheet column each value will
 * land in and shown as the raw stored value (a value the target column cannot
 * hold is already blank here).
 */
export function AiSpreadsheetImportSample(props: {
  title: string;
  preview: SheetImportPreview;
}) {
  const { columns, sampleRows } = props.preview;
  return (
    <section className="grid min-w-0 gap-2">
      <h3 className="text-label text-foreground">{props.title}</h3>
      <div className="max-h-import-section overflow-auto rounded-sm border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead className="whitespace-nowrap" key={column.source}>
                  {column.target.name}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sampleRows.map((row, rowIndex) => (
              // The sample is a fixed, never-reordered slice.
              <TableRow key={rowIndex}>
                {columns.map((column, index) => (
                  <TableCell
                    className="max-w-xs truncate whitespace-nowrap"
                    key={column.source}
                  >
                    {editableText(row[index] ?? null, "string")}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
