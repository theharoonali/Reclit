import ExcelJS from "exceljs";
import JSZip from "jszip";

// Multipart bodies for the upload routes (spreadsheet import, onboarding),
// built in memory: no fixture file is added to the repo. The XLSX one is
// written with the same library the service reads with, so it is a real
// workbook rather than a hand-rolled zip.

export const csvBody = (csv: string, name = "import.csv") => {
  const form = new FormData();
  form.append("file", new Blob([csv], { type: "text/csv" }), name);
  return form;
};

export async function xlsxBody(rows: unknown[][], name = "import.xlsx") {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  for (const row of rows) sheet.addRow(row);
  const bytes = new Uint8Array(
    (await workbook.xlsx.writeBuffer()) as ArrayBuffer,
  );
  const form = new FormData();
  const type =
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  form.append("file", new Blob([bytes], { type }), name);
  return form;
}

const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** WordprocessingML for one table: a paragraph per cell, a run per cell. */
const tableXml = (rows: string[][]) =>
  `<w:tbl><w:tblPr/>${rows
    .map(
      (row) =>
        `<w:tr>${row
          .map(
            (cell) =>
              `<w:tc><w:tcPr/><w:p><w:r><w:t xml:space="preserve">${escapeXml(cell)}</w:t></w:r></w:p></w:tc>`,
          )
          .join("")}</w:tr>`,
    )
    .join("")}</w:tbl>`;

/**
 * A minimal real .docx: the three parts Word needs, with every table preceded
 * by a prose paragraph (which the importer must ignore).
 */
export async function docxBody(tables: string[][][], name = "import.docx") {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  const body = tables
    .map(
      (table, index) =>
        `<w:p><w:r><w:t>Table ${index + 1}</w:t></w:r></w:p>${tableXml(table)}`,
    )
    .join("");
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`,
  );
  const bytes = await zip.generateAsync({ type: "uint8array" });
  const form = new FormData();
  const type =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  form.append("file", new Blob([bytes], { type }), name);
  return form;
}
