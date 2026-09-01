"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toColumnType, toNodeType } from "@/lib/ai-spreadsheet/cell-format";
import type {
  ApiColumn,
  CellValue,
  ColumnDraft,
  SheetColumn,
  SheetModel,
  SheetPayload,
} from "@/lib/ai-spreadsheet/types";
import { cellKey } from "@/lib/ai-spreadsheet/types";

/**
 * Turns the wire payload into the model the canvas paints from.
 *
 * Two things here are easy to get wrong and expensive to debug:
 *
 * - `row.index` is the absolute row number. With pagination it is not the
 *   position in `payload.rows`, so nothing below indexes into that array.
 * - A column carries two numbers: `index` is identity (it is what `col.<n>` is
 *   built from, and what a cell is addressed by) and `sortOrder` is position.
 *   Display order is `sortOrder`; the model keeps neither, because array order
 *   is the display order and `parseShortColumnId` recovers the index from the
 *   id.
 * - A row is nested — one `{ id, name, value }` entry per stored cell, keyed
 *   by column *id*, which is exactly how the model keys `cells`. An entry for
 *   a column the sheet does not know is stored but never painted (columns
 *   drive painting), and a blank cell is an absent entry.
 *
 * `payload.pagination` is deliberately not acted on. A row with no entry in
 * `cells` renders blank, which is already the right thing for a row that has
 * not been fetched; adding real paging means merging pages into `cells` and
 * tracking loaded ranges, and nothing else in the feature has to change.
 */
/** Shared by the initial payload and the reorder response, so they cannot drift. */
export const toModelColumn = (column: ApiColumn): SheetColumn => ({
  id: column.id,
  name: column.name,
  type: toColumnType(column.type),
  node: toNodeType(column.node),
  prompt: column.prompt,
});

export function normalize(payload: SheetPayload): SheetModel {
  const columns: SheetColumn[] = [...payload.columns]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(toModelColumn);

  let maxIndex = -1;
  for (const column of payload.columns) {
    maxIndex = Math.max(maxIndex, column.index);
  }

  const cells = new Map<string, CellValue>();
  const rowIds = new Map<number, string>();

  for (const row of payload.rows) {
    rowIds.set(row.index, row.id);
    for (const entry of row.columns) {
      // An absent entry and an explicit `null` are the same thing: no key at
      // all, which paints blank and stays editable.
      if (entry.value === null || entry.value === undefined) continue;
      cells.set(cellKey(row.index, entry.id), entry.value as CellValue);
    }
  }

  return {
    sheetId: payload.spreadsheet.id,
    sheetName: payload.spreadsheet.name,
    rowCount: payload.spreadsheet.totalRows,
    columns,
    cells,
    rowIds,
    nextColumnIndex: Math.max(maxIndex + 1, columns.length),
  };
}

export type SheetModelApi = {
  modelRef: React.RefObject<SheetModel>;
  /** Bumped only when the *DOM* has to re-render — never on a cell edit. */
  columnsVersion: number;
  getCell: (row: number, columnId: string) => CellValue;
  setCell: (row: number, columnId: string, value: CellValue) => void;
  addColumn: (draft: ColumnDraft) => void;
  updateColumn: (id: string, draft: ColumnDraft) => void;
  setColumnOrder: (columns: SheetColumn[]) => void;
  applyColumnOrder: (columns: ApiColumn[]) => void;
  removeColumn: (id: string) => void;
  removeRows: (rows: ReadonlySet<number>) => void;
};

export function useSheetModel(payload: SheetPayload): SheetModelApi {
  const modelRef = useRef<SheetModel | null>(null);
  if (modelRef.current === null) modelRef.current = normalize(payload);

  const payloadRef = useRef(payload);
  const [columnsVersion, setColumnsVersion] = useState(0);

  useEffect(() => {
    if (payloadRef.current === payload) return;
    payloadRef.current = payload;
    modelRef.current = normalize(payload);
    setColumnsVersion((version) => version + 1);
  }, [payload]);

  const getCell = useCallback(
    (row: number, columnId: string) =>
      modelRef.current?.cells.get(cellKey(row, columnId)) ?? null,
    [],
  );

  // Mutates the ref in place: a cell edit repaints the canvas, it does not
  // re-render React. A re-render would remount the canvas and blank it.
  const setCell = useCallback(
    (row: number, columnId: string, value: CellValue) => {
      const current = modelRef.current;
      if (!current) return;
      const key = cellKey(row, columnId);
      if (value === null) current.cells.delete(key);
      else current.cells.set(key, value);
    },
    [],
  );

  const addColumn = useCallback((draft: ColumnDraft) => {
    const current = modelRef.current;
    if (!current) return;
    // Matches the server's own id shape, and is deterministic — no
    // `crypto.randomUUID()`, which would differ between server and client.
    const id = `col.${current.nextColumnIndex}`;
    current.nextColumnIndex += 1;
    current.columns = [...current.columns, { id, ...draft }];
    setColumnsVersion((version) => version + 1);
  }, []);

  const updateColumn = useCallback((id: string, draft: ColumnDraft) => {
    const current = modelRef.current;
    if (!current) return;
    current.columns = current.columns.map((column) =>
      column.id === id ? { ...column, ...draft } : column,
    );
    setColumnsVersion((version) => version + 1);
  }, []);

  // Reorders in place. `cells` is untouched — keys are `${row}:${columnId}`, so
  // moving a column moves no value. The columns array changed, so this one
  // re-renders.
  const setColumnOrder = useCallback((columns: SheetColumn[]) => {
    const current = modelRef.current;
    if (!current) return;
    current.columns = columns;
    setColumnsVersion((version) => version + 1);
  }, []);

  /**
   * The server's order, applied only where it disagrees with what is already
   * on screen. The usual case is that it agrees — the drop moved the column
   * optimistically and the server did the same thing — and re-rendering to
   * install an identical array would be a re-render, and a repaint, for
   * nothing.
   */
  const applyColumnOrder = useCallback(
    (columns: ApiColumn[]) => {
      const current = modelRef.current;
      if (!current) return;
      const server = columns.map((column) => column.id).join();
      if (server === current.columns.map((column) => column.id).join()) return;
      setColumnOrder(columns.map(toModelColumn));
    },
    [setColumnOrder],
  );

  // Mirrors the backend: the column's wire index becomes a permanent gap, so
  // `nextColumnIndex` is deliberately untouched — the next column still
  // appends past the highest index ever minted. The columns array just gets
  // shorter, which narrows the content, so this one re-renders.
  const removeColumn = useCallback((id: string) => {
    const current = modelRef.current;
    if (!current) return;
    current.columns = current.columns.filter((column) => column.id !== id);
    for (const key of [...current.cells.keys()]) {
      const [, columnId] = key.split(/:(.*)/s);
      if (columnId === id) current.cells.delete(key);
    }
    setColumnsVersion((version) => version + 1);
  }, []);

  // Deleted rows go blank in place (absolute positions, nothing shifts), so
  // like a cell edit this repaints rather than re-renders.
  const removeRows = useCallback((rows: ReadonlySet<number>) => {
    const current = modelRef.current;
    if (!current) return;
    for (const key of [...current.cells.keys()]) {
      const row = Number.parseInt(key, 10);
      if (rows.has(row)) current.cells.delete(key);
    }
    for (const row of rows) current.rowIds.delete(row);
  }, []);

  return {
    modelRef: modelRef as React.RefObject<SheetModel>,
    columnsVersion,
    getCell,
    setCell,
    addColumn,
    updateColumn,
    setColumnOrder,
    applyColumnOrder,
    removeColumn,
    removeRows,
  };
}
