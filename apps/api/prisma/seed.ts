import { prisma } from "../src/db/prisma";
import type { CellValue } from "../src/modules/spreadsheet/spreadsheet.schema";
import { spreadsheetService } from "../src/modules/spreadsheet/spreadsheet.service";
import { spreadsheetCellsService } from "../src/modules/spreadsheet/spreadsheet-cells.service";

// Seeds the sample "Customers" sheet through the services (never raw prisma),
// so seeding exercises the same code paths and the scoped ids are correct by
// construction. Idempotent: exits if the sheet already exists.
// Run: bun run --filter=@reclit/api db:seed

const SHEET_NAME = "Customers";

const COLUMNS = [
  { name: "Name", type: "string" },
  { name: "Email", type: "email" },
  { name: "Age", type: "number" },
  { name: "Joined", type: "date" },
  { name: "Metadata", type: "json" },
  { name: "Active", type: "boolean" },
  { name: "Resume", type: "file" },
  { name: "Intro", type: "audio" },
] as const;

// Positional by column index; null = no cell. Mirrors the dashboard's old
// sample payload, holes included.
const ROWS: CellValue[][] = [
  [
    "Muhammad",
    "muhammad@example.com",
    26,
    "2026-08-27T10:00:00.000Z",
    { country: "Germany", skills: ["React", "Node.js"] },
    true,
    "https://example.com/files/muhammad-resume.pdf",
    "https://example.com/voice/muhammad-intro.mp3",
  ],
  [
    "Ali",
    null,
    29,
    null,
    { country: "Pakistan" },
    false,
    "https://example.com/files/ali-cv.pdf",
    "https://example.com/voice/ali-intro.mp3",
  ],
  [
    "John",
    "john@example.com",
    31,
    "2026-08-20T12:00:00.000Z",
    null,
    true,
    null,
    "https://example.com/voice/john-intro.mp3",
  ],
  [
    "Priya",
    "priya@example.com",
    34,
    "2023-06-21T09:15:00.000Z",
    { country: "India", plan: "free" },
    null,
    "https://example.com/files/priya-portfolio.pdf",
    null,
  ],
  ["Sofia", "sofia@example.com", 27, "2026-02-09T12:00:00.000Z"],
];

const existing = await prisma.spreadsheet.findFirst({
  where: { name: SHEET_NAME },
  select: { id: true },
});

if (existing) {
  console.log(`Seed skipped: "${SHEET_NAME}" already exists (${existing.id})`);
} else {
  const sheet = await spreadsheetService.create({
    name: SHEET_NAME,
    totalRows: 5_000_000,
  });
  for (const { name, type } of COLUMNS) {
    await spreadsheetCellsService.createColumn({ id: sheet.id, name, type });
  }
  for (const [rowIndex, values] of ROWS.entries()) {
    await spreadsheetCellsService.updateRow({
      id: sheet.id,
      rowIndex,
      cells: values
        .map((value, columnIndex) => ({ columnIndex, value }))
        .filter((cell) => cell.value !== null),
    });
  }
  console.log(`Seeded "${SHEET_NAME}" (${sheet.id})`);
}

await prisma.$disconnect();
