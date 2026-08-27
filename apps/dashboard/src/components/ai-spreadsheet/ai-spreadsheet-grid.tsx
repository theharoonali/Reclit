"use client";

import { useTranslations } from "next-intl";
import { useCallback, useRef, useState } from "react";
import type {
  ColumnType,
  JsonObject,
  PanelState,
  SheetPayload,
} from "@/lib/ai-spreadsheet/types";
import { AiSpreadsheetBody } from "./ai-spreadsheet-body";
import { AiSpreadsheetColumnForm } from "./ai-spreadsheet-column-form";
import { AiSpreadsheetDateEditor } from "./ai-spreadsheet-date-editor";
import { AiSpreadsheetHeader } from "./ai-spreadsheet-header";
import { AiSpreadsheetInputProxy } from "./ai-spreadsheet-input-proxy";
import { AiSpreadsheetJsonEditor } from "./ai-spreadsheet-json-editor";
import { AiSpreadsheetSidePanel } from "./ai-spreadsheet-side-panel";
import { useSheetCanvas } from "./use-sheet-canvas";
import { useSheetLabels } from "./use-sheet-labels";
import { useSheetModel } from "./use-sheet-model";

type AiSpreadsheetGridProps = { payload: SheetPayload };

type OpenPanel = Exclude<PanelState, { kind: "closed" }>;

/**
 * The sheet. Takes the payload and renders it; everything below is a piece of
 * that job rather than a feature of its own.
 *
 * The header is its own grid row and the side panel is pinned inside the row
 * below it, so the panel can never cover the header. It overlays the body
 * rather than sharing a track with it: opening it must not resize the sheet,
 * reflow the columns or force a repaint — the grid underneath is left exactly
 * as it was.
 */
export function AiSpreadsheetGrid({ payload }: AiSpreadsheetGridProps) {
  const t = useTranslations("aiSpreadsheet");
  const [panel, setPanel] = useState<PanelState>({ kind: "closed" });

  const { labels, formatters } = useSheetLabels();

  const model = useSheetModel(payload);
  const { modelRef, columnsVersion, getCell, setCell } = model;

  const openJson = useCallback((row: number, columnId: string) => {
    setPanel({ kind: "json", row, columnId });
  }, []);
  const openDate = useCallback((row: number, columnId: string) => {
    setPanel({ kind: "date", row, columnId });
  }, []);
  const openColumn = useCallback((columnId?: string) => {
    setPanel({ kind: "column", columnId });
  }, []);
  const closePanel = useCallback(() => setPanel({ kind: "closed" }), []);

  const canvas = useSheetCanvas({
    modelRef,
    columnsVersion,
    rowCount: payload.spreadsheet.totalRows,
    labels,
    formatters,
    getCell,
    setCell,
    onOpenJson: openJson,
    onOpenDate: openDate,
    onOpenColumn: openColumn,
  });

  const columns = modelRef.current.columns;

  const submitColumn = (name: string, type: ColumnType) => {
    const target = shownRef.current;
    if (target.kind !== "column") return;
    if (target.columnId) model.updateColumn(target.columnId, name, type);
    else model.addColumn(name, type);
    closePanel();
  };

  const changeJson = (value: JsonObject | null) => {
    const target = shownRef.current;
    if (target.kind !== "json") return;
    setCell(target.row, target.columnId, value);
    canvas.requestPaint();
  };

  const changeDate = (value: string | null) => {
    const target = shownRef.current;
    if (target.kind !== "date") return;
    setCell(target.row, target.columnId, value);
    canvas.requestPaint();
  };

  // The panel animates out, so it outlives its own state: `shown` is the last
  // thing it was opened for, and keeps rendering while it slides away.
  const shownRef = useRef<OpenPanel>({ kind: "column" });
  if (panel.kind !== "closed") shownRef.current = panel;
  const shown = shownRef.current;
  const isOpen = panel.kind !== "closed";

  const editedColumn =
    shown.kind === "column"
      ? columns.find((column) => column.id === shown.columnId)
      : undefined;

  const panelTitle =
    shown.kind === "json"
      ? t("panel.jsonTitle")
      : shown.kind === "date"
        ? t("panel.dateTitle")
        : editedColumn
          ? t("panel.editColumn")
          : t("panel.addColumn");

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-background">
      <AiSpreadsheetHeader
        addColumnLabel={t("addColumn")}
        canvasRef={canvas.headerCanvasRef}
        className="row-start-1"
        onAddColumn={() => openColumn()}
        onPointerDown={canvas.handleHeaderPointerDown}
        onPointerLeave={canvas.handleHeaderPointerLeave}
        onPointerMove={canvas.handleHeaderPointerMove}
      />

      <div className="relative row-start-2 min-h-0 overflow-hidden">
        <AiSpreadsheetBody
          canvasRef={canvas.bodyCanvasRef}
          className="absolute inset-0"
          columnCount={columns.length}
          label={t("gridLabel", { name: modelRef.current.sheetName })}
          onDoubleClick={canvas.handleBodyDoubleClick}
          onPointerDown={canvas.handleBodyPointerDown}
          rowCount={payload.spreadsheet.totalRows}
          scrollerRef={canvas.scrollerRef}
          spacerRef={canvas.spacerRef}
        >
          <AiSpreadsheetInputProxy
            editor={canvas.editor}
            label={t("cellInput")}
          />
        </AiSpreadsheetBody>

        <AiSpreadsheetSidePanel
          className="absolute inset-y-0 right-0 z-10"
          closeLabel={t("panel.close")}
          onClose={closePanel}
          open={isOpen}
          title={panelTitle}
        >
          {shown.kind === "column" && (
            <AiSpreadsheetColumnForm
              column={editedColumn}
              key={shown.columnId ?? "new"}
              labels={{
                name: t("column.name"),
                namePlaceholder: t("column.namePlaceholder"),
                type: t("column.type"),
                submit: editedColumn ? t("column.save") : t("column.add"),
                cancel: t("column.cancel"),
                typeNames: labels.typeNames,
              }}
              onCancel={closePanel}
              onSubmit={submitColumn}
            />
          )}

          {shown.kind === "json" && (
            <AiSpreadsheetJsonEditor
              key={`${shown.row}:${shown.columnId}`}
              labels={{
                key: t("json.key"),
                value: t("json.value"),
                add: t("json.add"),
                remove: t("json.remove"),
                empty: t("json.empty"),
              }}
              onChange={changeJson}
              value={asJsonObject(getCell(shown.row, shown.columnId))}
            />
          )}

          {shown.kind === "date" && (
            <AiSpreadsheetDateEditor
              key={`${shown.row}:${shown.columnId}`}
              labels={{
                clear: t("date.clear"),
                empty: t("date.empty"),
                previousMonth: t("date.previousMonth"),
                nextMonth: t("date.nextMonth"),
              }}
              onChange={changeDate}
              value={getCell(shown.row, shown.columnId)}
            />
          )}
        </AiSpreadsheetSidePanel>
      </div>
    </div>
  );
}

function asJsonObject(value: unknown): JsonObject | null {
  return typeof value === "object" && value !== null
    ? (value as JsonObject)
    : null;
}
