"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toColumnType } from "@/lib/ai-spreadsheet/cell-format";
import type {
  CellValue,
  ColumnType,
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
 * - `row.data` is positional by column *index* while the model keys by column
 *   *id*. The mapping happens once, here, by walking the columns rather than
 *   the array, so a short `data` array and a `data` entry with no column are
 *   both simply not read.
 *
 * `payload.pagination` is deliberately not acted on. A row with no entry in
 * `cells` renders blank, which is already the right thing for a row that has
 * not been fetched; adding real paging means merging pages into `cells` and
 * tracking loaded ranges, and nothing else in the feature has to change.
 */
export function normalize(payload: SheetPayload): SheetModel {
  const columns: SheetColumn[] = [...payload.columns]
    .sort((a, b) => a.index - b.index)
    .map((column) => ({
      id: column.id,
      name: column.name,
      type: toColumnType(column.type),
    }));

  let maxIndex = -1;
  for (const column of payload.columns) {
    maxIndex = Math.max(maxIndex, column.index);
  }

  const cells = new Map<string, CellValue>();
  const rowIds = new Map<number, string>();

  for (const row of payload.rows) {
    rowIds.set(row.index, row.id);
    for (const column of payload.columns) {
      const value = row.data[column.index];
      // An absent entry and an explicit `null` are the same thing: no key at
      // all, which paints blank and stays editable.
      if (value === undefined || value === null) continue;
      cells.set(cellKey(row.index, column.id), value as CellValue);
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
  addColumn: (name: string, type: ColumnType) => void;
  updateColumn: (id: string, name: string, type: ColumnType) => void;
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

  const addColumn = useCallback((name: string, type: ColumnType) => {
    const current = modelRef.current;
    if (!current) return;
    // Matches the server's own id shape, and is deterministic — no
    // `crypto.randomUUID()`, which would differ between server and client.
    const id = `col.${current.nextColumnIndex}`;
    current.nextColumnIndex += 1;
    current.columns = [...current.columns, { id, name, type }];
    setColumnsVersion((version) => version + 1);
  }, []);

  const updateColumn = useCallback(
    (id: string, name: string, type: ColumnType) => {
      const current = modelRef.current;
      if (!current) return;
      current.columns = current.columns.map((column) =>
        column.id === id ? { ...column, name, type } : column,
      );
      setColumnsVersion((version) => version + 1);
    },
    [],
  );

  return {
    modelRef: modelRef as React.RefObject<SheetModel>,
    columnsVersion,
    getCell,
    setCell,
    addColumn,
    updateColumn,
  };
}
