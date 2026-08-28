import type {
  RouterInputs,
  RouterOutputs,
} from "@reclit/api/trpc/routers/_app";

/**
 * Pure state and validation for the public form — no React, no fetching.
 * The value rules mirror the backend's `cellValueMatchesType` in
 * `apps/api/src/modules/spreadsheet/spreadsheet.schema.ts`: what passes here
 * is exactly what `spreadsheet.appendRow` will accept.
 */

export type SheetPayload = RouterOutputs["spreadsheet"]["rows"];
export type FormColumn = SheetPayload["columns"][number];
export type AppendRowCells = RouterInputs["spreadsheet"]["appendRow"]["cells"];
export type CellValue = AppendRowCells[number]["value"];

/**
 * One field's draft. `raw` carries every text-shaped input; audio/file keep
 * the picked `File` until submit uploads it; boolean lives in `checked`.
 */
export type FieldDraft = {
  raw: string;
  file: File | null;
  checked: boolean;
};

export type FormDraft = Record<number, FieldDraft>;

export const emptyDraft = (): FieldDraft => ({
  raw: "",
  file: null,
  checked: false,
});

/** The types the form renders — everything except storage-only formulas. */
export const isFillable = (column: FormColumn) => column.type !== "formula";

// Mirrors of the backend's URL_RE / EMAIL_RE.
const URL_RE = /^https?:\/\/\S+$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Whether the visitor put anything into this field. */
export function isFilled(type: FormColumn["type"], draft: FieldDraft): boolean {
  switch (type) {
    case "boolean":
      // Unchecked is "no answer", not `false` — an optional checkbox cannot
      // tell the two apart, so only a checked box counts as filled.
      return draft.checked;
    case "audio":
    case "file":
      return draft.file !== null;
    default:
      return draft.raw.trim() !== "";
  }
}

export function hasAnyFilledField(
  columns: FormColumn[],
  draft: FormDraft,
): boolean {
  return columns.some((column) =>
    isFilled(column.type, draft[column.index] ?? emptyDraft()),
  );
}

export type FieldResult =
  | { ok: true; value: CellValue }
  | { ok: false; errorKey: "number" | "email" | "url" | "json" };

/**
 * Validates one FILLED text-shaped field and produces its wire value.
 * Audio/file fields are not handled here — their value is the URL the upload
 * returns at submit time; boolean is `true` by definition of "filled".
 */
export function validateField(
  type: FormColumn["type"],
  raw: string,
): FieldResult {
  const trimmed = raw.trim();
  switch (type) {
    case "number": {
      const value = Number(trimmed);
      if (!Number.isFinite(value)) return { ok: false, errorKey: "number" };
      return { ok: true, value };
    }
    case "email":
      if (!EMAIL_RE.test(trimmed)) return { ok: false, errorKey: "email" };
      return { ok: true, value: trimmed };
    case "url":
      if (!URL_RE.test(trimmed)) return { ok: false, errorKey: "url" };
      return { ok: true, value: trimmed };
    case "json": {
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        return { ok: false, errorKey: "json" };
      }
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      )
        return { ok: false, errorKey: "json" };
      return { ok: true, value: parsed as Record<string, unknown> };
    }
    default:
      // string and date — the native date input already emits a parseable
      // YYYY-MM-DD string, so both travel as-is.
      return { ok: true, value: trimmed };
  }
}
