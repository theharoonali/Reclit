"use client";

import { useTranslations } from "next-intl";
import { useCallback, useRef, useState } from "react";
import { sheetToCsv } from "@/lib/ai-spreadsheet/export-csv";
import type {
  ColumnDraft,
  JsonObject,
  PanelState,
  SheetPayload,
} from "@/lib/ai-spreadsheet/types";
import { AiSpreadsheetBody } from "./ai-spreadsheet-body";
import { AiSpreadsheetCellClearButton } from "./ai-spreadsheet-cell-clear-button";
import { AiSpreadsheetColumnForm } from "./ai-spreadsheet-column-form";
import { AiSpreadsheetDateEditor } from "./ai-spreadsheet-date-editor";
import { AiSpreadsheetDragChip } from "./ai-spreadsheet-drag-chip";
import { AiSpreadsheetExportButton } from "./ai-spreadsheet-export-button";
import { AiSpreadsheetHeader } from "./ai-spreadsheet-header";
import { AiSpreadsheetImportButton } from "./ai-spreadsheet-import-button";
import { AiSpreadsheetInputProxy } from "./ai-spreadsheet-input-proxy";
import { AiSpreadsheetJsonEditor } from "./ai-spreadsheet-json-editor";
import { AiSpreadsheetSelectionBar } from "./ai-spreadsheet-selection-bar";
import { AiSpreadsheetSidePanel } from "./ai-spreadsheet-side-panel";
import { AiSpreadsheetUploadEditor } from "./ai-spreadsheet-upload-editor";
import { useColumnRemove } from "./use-column-remove";
import { useColumnReorder } from "./use-column-reorder";
import { useSheetCanvas } from "./use-sheet-canvas";
import { useSheetImport } from "./use-sheet-import";
import { useSheetLabels } from "./use-sheet-labels";
import { useSheetModel } from "./use-sheet-model";
import { useSheetSelection } from "./use-sheet-selection";
import { useSheetSync } from "./use-sheet-sync";

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
  // Flipped by the editor only when the cell selection goes empty ↔ non-empty,
  // so the header's clear button can be DOM without re-rendering per keystroke.
  const [cellsSelected, setCellsSelected] = useState(false);

  const { labels, formatters } = useSheetLabels();

  const model = useSheetModel(payload);
  const { modelRef, columnsVersion, getCell } = model;

  // The canvas is created below, but the sync hook needs a paint trigger now;
  // the indirection breaks the cycle without a re-render.
  const requestPaintRef = useRef<() => void>(() => {});
  const requestPaint = useCallback(() => requestPaintRef.current(), []);

  const sync = useSheetSync({
    modelRef,
    setCellLocal: model.setCell,
    requestPaint,
  });
  const setCell = sync.setCell;
  const discardPending = sync.discardPending;

  // Set after the canvas exists — the selection hook only calls it on delete.
  const cancelEditRef = useRef<() => void>(() => {});
  const onBeforeDelete = useCallback(() => {
    // A pending debounced write to a deleted row would re-create its cell
    // right after the delete; an active edit could do the same on commit.
    discardPending();
    cancelEditRef.current();
  }, [discardPending]);

  const selection = useSheetSelection({
    modelRef,
    requestPaint,
    onBeforeDelete,
    removeRowsLocal: model.removeRows,
  });

  const openJson = useCallback((row: number, columnId: string) => {
    setPanel({ kind: "json", row, columnId });
  }, []);
  const openDate = useCallback((row: number, columnId: string) => {
    setPanel({ kind: "date", row, columnId });
  }, []);
  const openAudio = useCallback((row: number, columnId: string) => {
    setPanel({ kind: "audio", row, columnId });
  }, []);
  const openFile = useCallback((row: number, columnId: string) => {
    setPanel({ kind: "file", row, columnId });
  }, []);
  const openColumn = useCallback((columnId?: string) => {
    setPanel({ kind: "column", columnId });
  }, []);
  const closePanel = useCallback(() => setPanel({ kind: "closed" }), []);

  // Set after the canvas exists, like `cancelEditRef` — the removal hook is
  // wired into the canvas's pointer handlers, so it must be created first.
  const afterColumnRemoveRef = useRef<(columnId: string) => void>(() => {});
  const columnRemove = useColumnRemove({
    modelRef,
    onBeforeRemove: onBeforeDelete,
    removeColumnLocal: model.removeColumn,
    onAfterRemove: (columnId) => afterColumnRemoveRef.current(columnId),
  });

  // Set after the canvas exists, like `afterColumnRemoveRef`.
  const afterColumnReorderRef = useRef<
    (columnId: string, from: number) => void
  >(() => {});
  const columnReorder = useColumnReorder({
    modelRef,
    setColumnOrder: model.setColumnOrder,
    applyColumnOrder: model.applyColumnOrder,
    onAfterReorder: (columnId, from) =>
      afterColumnReorderRef.current(columnId, from),
  });

  // The chip that rides the pointer during a column drag. Refs, not state: it
  // is repositioned on every pointer move.
  const dragChipRef = useRef<HTMLDivElement | null>(null);
  const dragChipLabelRef = useRef<HTMLSpanElement | null>(null);

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
    onOpenAudio: openAudio,
    onOpenFile: openFile,
    onOpenColumn: openColumn,
    onRemoveColumn: columnRemove.removeColumn,
    onReorderColumn: columnReorder.reorderColumn,
    onBeforeColumnChange: onBeforeDelete,
    dragChipRef,
    dragChipLabelRef,
    onSelectionPresence: setCellsSelected,
    selectedRef: selection.selectedRef,
    selectAllState: selection.selectAllState,
    onToggleRow: selection.toggleRow,
    onToggleAllRows: selection.toggleAll,
  });
  requestPaintRef.current = canvas.requestPaint;
  cancelEditRef.current = canvas.editor.cancel;

  const exportCsv = useCallback(() => {
    const model = modelRef.current;
    if (!model) return;
    // The model is the most truthful snapshot: the loader merged every stored
    // page before the grid mounted, and unsaved debounced edits are in it too.
    // The BOM makes Excel detect UTF-8.
    const blob = new Blob([String.fromCharCode(0xfeff), sheetToCsv(model)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${model.sheetName.replace(/[\\/:*?"<>|]/g, "-")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [modelRef]);

  const importer = useSheetImport({
    sheetId: payload.spreadsheet.id,
    discardPending: sync.discardPending,
    onBeforeRefresh: () => {
      // The active cell may be in a column the imported sheet does not have.
      canvas.editor.cancel();
      canvas.editor.selectCell(0, 0);
    },
  });

  const importError =
    importer.errorCode === null
      ? null
      : importer.errorCode === "SPREADSHEET_IMPORT_UNSUPPORTED_TYPE"
        ? t("import.errorType")
        : importer.errorCode === "SPREADSHEET_IMPORT_EMPTY"
          ? t("import.errorEmpty")
          : importer.errorCode === "SPREADSHEET_IMPORT_TOO_LARGE"
            ? t("import.errorTooLarge")
            : t("import.error");

  const columns = modelRef.current.columns;

  const submitColumn = (draft: ColumnDraft) => {
    const target = shownRef.current;
    if (target.kind !== "column") return;
    if (target.columnId) {
      model.updateColumn(target.columnId, draft);
      sync.syncColumnUpdate(target.columnId, draft);
    } else {
      model.addColumn(draft);
      sync.syncColumnCreate(draft);
    }
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

  const changeUpload = (value: string | null) => {
    const target = shownRef.current;
    if (target.kind !== "audio" && target.kind !== "file") return;
    setCell(target.row, target.columnId, value);
    canvas.requestPaint();
  };

  // The panel animates out, so it outlives its own state: `shown` is the last
  // thing it was opened for, and keeps rendering while it slides away.
  const shownRef = useRef<OpenPanel>({ kind: "column" });
  if (panel.kind !== "closed") shownRef.current = panel;
  const shown = shownRef.current;
  const isOpen = panel.kind !== "closed";

  // Post-delete cleanup. The columns array just shifted left, so the editor's
  // and hover's display positions are stale: clamp the active cell back into
  // range (collapsing any shift-range with it) and drop the hover. The panel
  // closes only when it was showing the deleted column.
  afterColumnRemoveRef.current = (columnId: string) => {
    const target = shownRef.current;
    if ("columnId" in target && target.columnId === columnId) closePanel();
    const remaining = modelRef.current.columns;
    const active = canvas.editor.editorRef.current.active;
    if (remaining.length > 0 && active) {
      canvas.editor.selectCell(
        active.row,
        Math.min(active.col, remaining.length - 1),
      );
    }
    canvas.resetHover();
    canvas.requestPaint();
  };

  // The columns array just shuffled, so the editor's `col` — a display
  // position — names a different column than it did. Remapping it keeps the
  // selection on the cell the user was looking at. This is not the frontend
  // recomputing the column order (the server's response already did that); it
  // is moving a cursor the server knows nothing about. `selectCell` collapses
  // any shift-range with it, because a rectangle over display positions means
  // something else now.
  afterColumnReorderRef.current = (columnId: string, from: number) => {
    const columns = modelRef.current.columns;
    const to = columns.findIndex((column) => column.id === columnId);
    const active = canvas.editor.editorRef.current.active;
    if (active && to >= 0) {
      const inBand =
        from < to
          ? active.col > from && active.col <= to
          : active.col >= to && active.col < from;
      const next =
        active.col === from
          ? to
          : inBand
            ? active.col + (from < to ? -1 : 1)
            : active.col;
      canvas.editor.selectCell(active.row, Math.min(next, columns.length - 1));
    }
    canvas.resetHover();
    canvas.requestPaint();
  };

  const editedColumn =
    shown.kind === "column"
      ? columns.find((column) => column.id === shown.columnId)
      : undefined;

  const panelTitle =
    shown.kind === "json"
      ? t("panel.jsonTitle")
      : shown.kind === "date"
        ? t("panel.dateTitle")
        : shown.kind === "audio"
          ? t("panel.audioTitle")
          : shown.kind === "file"
            ? t("panel.fileTitle")
            : editedColumn
              ? t("panel.editColumn")
              : t("panel.addColumn");

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-background">
      <AiSpreadsheetImportButton
        errorMessage={importError}
        labels={{ import: t("import.label"), importing: t("import.importing") }}
        onPick={importer.run}
        status={importer.status}
      />

      <AiSpreadsheetExportButton
        label={t("export.label")}
        onExport={exportCsv}
      />

      <AiSpreadsheetCellClearButton
        label={t("cells.delete")}
        onClear={canvas.editor.clearSelectedCells}
        visible={cellsSelected}
      />

      <AiSpreadsheetSelectionBar
        count={selection.count}
        labels={{
          selected: t("selection.selected", { count: selection.count }),
          delete: t("selection.delete"),
          deleting: t("selection.deleting"),
          error: t("selection.error"),
        }}
        onDelete={selection.deleteSelected}
        status={selection.status}
      />

      <AiSpreadsheetHeader
        addColumnLabel={t("addColumn")}
        canvasRef={canvas.headerCanvasRef}
        className="row-start-1"
        gripAnchor={canvas.gripAnchor}
        gripLabel={t("column.reorder")}
        onAddColumn={() => openColumn()}
        onPointerCancel={canvas.handleHeaderPointerCancel}
        onPointerDown={canvas.handleHeaderPointerDown}
        onPointerLeave={canvas.handleHeaderPointerLeave}
        onPointerMove={canvas.handleHeaderPointerMove}
        onPointerUp={canvas.handleHeaderPointerUp}
      />

      <AiSpreadsheetDragChip
        chipRef={dragChipRef}
        labelRef={dragChipLabelRef}
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
                node: t("column.node"),
                prompt: t("column.prompt"),
                promptPlaceholder: t("column.promptPlaceholder"),
                submit: editedColumn ? t("column.save") : t("column.add"),
                cancel: t("column.cancel"),
                typeNames: labels.typeNames,
                nodeNames: {
                  none: t("nodes.none"),
                  ai: t("nodes.ai"),
                  email: t("nodes.email"),
                },
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

          {shown.kind === "audio" && (
            <AiSpreadsheetUploadEditor
              accept="audio/*"
              key={`audio:${shown.row}:${shown.columnId}`}
              labels={{
                upload: t("audio.upload"),
                replace: t("audio.replace"),
                uploading: t("audio.uploading"),
                error: t("audio.error"),
                clear: t("audio.clear"),
                empty: t("audio.empty"),
              }}
              onChange={changeUpload}
              value={getCell(shown.row, shown.columnId)}
            />
          )}

          {shown.kind === "file" && (
            <AiSpreadsheetUploadEditor
              key={`file:${shown.row}:${shown.columnId}`}
              labels={{
                upload: t("file.upload"),
                replace: t("file.replace"),
                uploading: t("file.uploading"),
                error: t("file.error"),
                clear: t("file.clear"),
                empty: t("file.empty"),
              }}
              onChange={changeUpload}
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
