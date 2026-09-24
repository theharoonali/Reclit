import ExcelJS from "exceljs";

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
