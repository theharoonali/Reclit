import { describe, expect, it } from "bun:test";
import { SHEET_FILE_ACCEPT } from "@/lib/ai-spreadsheet/import-file";

// The picker filter must offer every format the import endpoint reads
// (`detectFormat` in apps/api), by extension and by MIME type.
describe("SHEET_FILE_ACCEPT", () => {
  it("offers csv, xlsx and docx", () => {
    const accepted = SHEET_FILE_ACCEPT.split(",");
    for (const entry of [
      ".csv",
      ".xlsx",
      ".docx",
      "text/csv",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]) {
      expect(accepted).toContain(entry);
    }
  });

  it("does not offer the legacy binary formats the API rejects", () => {
    expect(SHEET_FILE_ACCEPT).not.toMatch(/\.xls(,|$)|\.doc(,|$)/);
  });
});
