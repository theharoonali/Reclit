import { describe, expect, test } from "bun:test";
import {
  emptyDraft,
  type FieldDraft,
  type FormDraft,
  type FormField,
  hasAnyFilledField,
  isFilled,
  isUploading,
  isWideField,
  toSubmitFields,
  validateField,
} from "@/lib/public-form";

const field = (
  columnIndex: number,
  name: string,
  type: FormField["type"] = "string",
): FormField => ({ columnIndex, name, type });

const draftOf = (over: Partial<FieldDraft>): FieldDraft => ({
  ...emptyDraft(),
  ...over,
});

const uploaded = (url: string): FieldDraft["upload"] => ({
  status: "uploaded",
  file: { url, name: "a.mp3", mimeType: "audio/mpeg", size: 9 },
});

describe("validateField", () => {
  test("trims and passes strings and dates through", () => {
    expect(validateField("string", "  Acme ")).toEqual({
      ok: true,
      value: "Acme",
    });
    expect(validateField("date", "2026-01-31")).toEqual({
      ok: true,
      value: "2026-01-31",
    });
  });

  test("parses numbers and refuses what is not one", () => {
    expect(validateField("number", " 4.5 ")).toEqual({ ok: true, value: 4.5 });
    expect(validateField("number", "four")).toEqual({
      ok: false,
      errorKey: "number",
    });
  });

  test("checks email and url shapes", () => {
    expect(validateField("email", "a@b.co").ok).toBe(true);
    expect(validateField("email", "a@b")).toEqual({
      ok: false,
      errorKey: "email",
    });
    expect(validateField("url", "https://acme.test").ok).toBe(true);
    expect(validateField("url", "acme.test")).toEqual({
      ok: false,
      errorKey: "url",
    });
  });

  test("accepts only a JSON object", () => {
    expect(validateField("json", '{"a":1}')).toEqual({
      ok: true,
      value: { a: 1 },
    });
    for (const raw of ["[1]", "1", "null", "{oops"]) {
      expect(validateField("json", raw)).toEqual({
        ok: false,
        errorKey: "json",
      });
    }
  });
});

describe("isFilled", () => {
  test("text fields are filled by non-blank text", () => {
    expect(isFilled("string", draftOf({ raw: "  " }))).toBe(false);
    expect(isFilled("string", draftOf({ raw: "x" }))).toBe(true);
  });

  test("a checkbox is filled only when checked", () => {
    expect(isFilled("boolean", draftOf({}))).toBe(false);
    expect(isFilled("boolean", draftOf({ checked: true }))).toBe(true);
  });

  test("a file field is filled only once its upload finished", () => {
    const uploading = { status: "uploading", fileName: "a.mp3" } as const;
    const failed = {
      status: "error",
      fileName: "a.mp3",
      reason: "upload",
    } as const;
    expect(isFilled("audio", draftOf({}))).toBe(false);
    expect(isFilled("audio", draftOf({ upload: uploading }))).toBe(false);
    expect(isFilled("file", draftOf({ upload: failed }))).toBe(false);
    expect(isFilled("file", draftOf({ upload: uploaded("https://f/a") }))).toBe(
      true,
    );
  });
});

describe("form-level checks", () => {
  const fields = [field(0, "Company"), field(4, "Voice", "audio")];

  test("hasAnyFilledField and isUploading read the draft by column index", () => {
    expect(hasAnyFilledField(fields, {})).toBe(false);
    expect(isUploading(fields, {})).toBe(false);
    const draft: FormDraft = {
      4: draftOf({ upload: { status: "uploading", fileName: "a.mp3" } }),
    };
    expect(hasAnyFilledField(fields, draft)).toBe(false);
    expect(isUploading(fields, draft)).toBe(true);
  });

  test("isWideField spans json and the file types", () => {
    expect(
      ["json", "audio", "file"].every((t) => isWideField(t as never)),
    ).toBe(true);
    expect(isWideField("string")).toBe(false);
    expect(isWideField("boolean")).toBe(false);
  });
});

describe("toSubmitFields", () => {
  const fields = [
    field(0, "Company"),
    field(1, "Score", "number"),
    field(2, "Active", "boolean"),
    field(3, "Voice", "audio"),
    field(5, "Notes"),
  ];

  test("keys every filled field by column name and leaves the rest out", () => {
    const draft: FormDraft = {
      0: draftOf({ raw: " Acme " }),
      1: draftOf({ raw: "7" }),
      2: draftOf({ checked: true }),
      3: draftOf({ upload: uploaded("https://files.test/a.mp3") }),
    };
    expect(toSubmitFields(fields, draft)).toEqual({
      ok: true,
      fields: {
        Company: "Acme",
        Score: 7,
        Active: true,
        Voice: "https://files.test/a.mp3",
      },
    });
  });

  test("an unchecked box is no answer, not false", () => {
    const result = toSubmitFields(fields, { 0: draftOf({ raw: "Acme" }) });
    expect(result).toEqual({ ok: true, fields: { Company: "Acme" } });
  });

  test("reports every invalid field by column index and submits nothing", () => {
    const result = toSubmitFields([...fields, field(6, "Site", "url")], {
      0: draftOf({ raw: "Acme" }),
      1: draftOf({ raw: "seven" }),
      6: draftOf({ raw: "acme" }),
    });
    expect(result).toEqual({ ok: false, errors: { 1: "number", 6: "url" } });
  });
});
