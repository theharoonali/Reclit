import { describe, expect, test } from "bun:test";
import {
  DOCUMENT_ACCEPT,
  documentMimeType,
  documentPickError,
  documentStatusKey,
  isDocumentBusy,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENTS,
} from "@/lib/company/documents";

const file = (name: string, type = "", size = 1024) => ({ name, type, size });

describe("documentMimeType", () => {
  test("reads the type from the extension, whatever the browser says", () => {
    expect(documentMimeType(file("notes.md"))).toBe("text/markdown");
    expect(documentMimeType(file("list.CSV", "application/vnd.ms-excel"))).toBe(
      "text/csv",
    );
    expect(documentMimeType(file("logo.jpeg", "image/jpeg"))).toBe(
      "image/jpeg",
    );
  });

  test("falls back on an accepted browser type without a known extension", () => {
    expect(documentMimeType(file("scan", "application/pdf"))).toBe(
      "application/pdf",
    );
  });

  test("refuses anything else", () => {
    expect(
      documentMimeType(
        file(
          "deck.docx",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ),
      ),
    ).toBeNull();
    expect(documentMimeType(file("pdf"))).toBeNull();
  });
});

describe("documentPickError", () => {
  test("accepts a supported file under the limits", () => {
    expect(documentPickError(file("a.pdf"), 0)).toBeNull();
    expect(
      documentPickError(file("a.pdf", "", MAX_DOCUMENT_BYTES), 0),
    ).toBeNull();
  });

  test("refuses the type, the size and the count", () => {
    expect(documentPickError(file("a.docx"), 0)).toBe("documentType");
    expect(
      documentPickError(file("a.pdf", "", MAX_DOCUMENT_BYTES + 1), 0),
    ).toBe("documentTooLarge");
    expect(documentPickError(file("a.pdf"), MAX_DOCUMENTS)).toBe(
      "documentLimit",
    );
  });
});

describe("document status", () => {
  test("maps every status to its message key; PENDING reads as processing", () => {
    expect(documentStatusKey("UPLOADING")).toBe("uploading");
    expect(documentStatusKey("PENDING")).toBe("processing");
    expect(documentStatusKey("PROCESSING")).toBe("processing");
    expect(documentStatusKey("READY")).toBe("ready");
    expect(documentStatusKey("FAILED")).toBe("failed");
  });

  test("is busy until ready or failed", () => {
    expect(isDocumentBusy("UPLOADING")).toBe(true);
    expect(isDocumentBusy("PENDING")).toBe(true);
    expect(isDocumentBusy("PROCESSING")).toBe(true);
    expect(isDocumentBusy("READY")).toBe(false);
    expect(isDocumentBusy("FAILED")).toBe(false);
  });
});

test("DOCUMENT_ACCEPT names the seven types and their extensions", () => {
  const accept = DOCUMENT_ACCEPT.split(",");
  for (const entry of [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
    "text/plain",
    "text/markdown",
    "text/csv",
    ".md",
    ".csv",
  ]) {
    expect(accept).toContain(entry);
  }
});
