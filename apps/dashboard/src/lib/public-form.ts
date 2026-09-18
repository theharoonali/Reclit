import type {
  RouterInputs,
  RouterOutputs,
} from "@reclit/api/trpc/routers/_app";
import type { UploadedFile } from "@/lib/upload-file";

/**
 * Pure state and validation for the public form — no React, no fetching.
 * The value rules mirror the backend's `cellValueMatchesType` in
 * `apps/api/src/modules/spreadsheet/spreadsheet.schema.ts`: what passes here
 * is exactly what `populate.submit` will accept. Which columns are fields at
 * all is the server's call (`populate.form`).
 */

export type FormField = RouterOutputs["populate"]["form"]["fields"][number];
export type SubmitFields = RouterInputs["populate"]["submit"]["fields"];
export type CellValue = SubmitFields[string];

/** An audio/file field: the file is uploaded the moment it is picked. */
export type UploadState =
  | { status: "idle" }
  | { status: "uploading"; fileName: string }
  | { status: "uploaded"; file: UploadedFile }
  | { status: "error"; fileName: string; reason: "upload" | "tooLarge" };

/**
 * One field's draft. `raw` carries every text-shaped input; audio/file live
 * in `upload`; boolean lives in `checked`.
 */
export type FieldDraft = {
  raw: string;
  upload: UploadState;
  checked: boolean;
};

/** Keyed by column index — names are data and need not be unique in a draft. */
export type FormDraft = Record<number, FieldDraft>;

export const emptyDraft = (): FieldDraft => ({
  raw: "",
  upload: { status: "idle" },
  checked: false,
});

const draftOf = (draft: FormDraft, field: FormField) =>
  draft[field.columnIndex] ?? emptyDraft();

/** Fields that take the full row of the two-column grid. */
export const isWideField = (type: FormField["type"]) =>
  type === "json" || type === "audio" || type === "file";

// Mirrors of the backend's URL_RE / EMAIL_RE.
const URL_RE = /^https?:\/\/\S+$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Whether the visitor put anything into this field. */
export function isFilled(type: FormField["type"], draft: FieldDraft): boolean {
  switch (type) {
    case "boolean":
      // Unchecked is "no answer", not `false` — an optional checkbox cannot
      // tell the two apart, so only a checked box counts as filled.
      return draft.checked;
    case "audio":
    case "file":
      return draft.upload.status === "uploaded";
    default:
      return draft.raw.trim() !== "";
  }
}

export const hasAnyFilledField = (fields: FormField[], draft: FormDraft) =>
  fields.some((field) => isFilled(field.type, draftOf(draft, field)));

/** A submit must wait for every picked file to finish uploading. */
export const isUploading = (fields: FormField[], draft: FormDraft) =>
  fields.some((field) => draftOf(draft, field).upload.status === "uploading");

export type FieldErrorKey = "number" | "email" | "url" | "json";

export type FieldResult =
  | { ok: true; value: CellValue }
  | { ok: false; errorKey: FieldErrorKey };

/**
 * Validates one FILLED text-shaped field and produces its wire value.
 * Audio/file fields are not handled here — their value is the uploaded URL;
 * boolean is `true` by definition of "filled".
 */
export function validateField(
  type: FormField["type"],
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

export type SubmitResult =
  | { ok: true; fields: SubmitFields }
  | { ok: false; errors: Record<number, FieldErrorKey> };

/**
 * The `populate.submit` payload for a draft: every filled field under its
 * column name, or the per-column errors that block it. Unfilled fields are
 * left out — an unchecked box is "no answer", not `false`.
 */
export function toSubmitFields(
  fields: FormField[],
  draft: FormDraft,
): SubmitResult {
  const values: SubmitFields = {};
  const errors: Record<number, FieldErrorKey> = {};
  for (const field of fields) {
    const current = draftOf(draft, field);
    if (!isFilled(field.type, current)) continue;
    if (field.type === "boolean") {
      values[field.name] = true;
    } else if (current.upload.status === "uploaded") {
      values[field.name] = current.upload.file.url;
    } else {
      const result = validateField(field.type, current.raw);
      if (result.ok) values[field.name] = result.value;
      else errors[field.columnIndex] = result.errorKey;
    }
  }
  return Object.keys(errors).length > 0
    ? { ok: false, errors }
    : { ok: true, fields: values };
}
