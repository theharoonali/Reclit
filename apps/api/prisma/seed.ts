import { prisma } from "../src/db/prisma";
import type { CellValue } from "../src/modules/spreadsheet/spreadsheet.schema";
import { spreadsheetCellsService } from "../src/modules/spreadsheet/spreadsheet-cells.service";
import { userService } from "../src/modules/user/user.service";
import { workspaceService } from "../src/modules/workspace/workspace.service";

// Seeds the default user and the sample "Customers" workspace + sheet through
// the services (never raw prisma), so seeding exercises the same code paths
// and the scoped ids are correct by construction. Idempotent: exits if the
// workspace or sheet already exists (a backfilled DB has both).
// Run: bun run --filter=@reclit/api db:seed

const SHEET_NAME = "Customers";
const USER_NAME = "Demo User";
const USER_EMAIL = "demo@reclit.app";

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

const existingUser = await prisma.user.findFirst({ select: { id: true } });
if (existingUser) {
  console.log(`Seed: user already exists (${existingUser.id})`);
} else {
  const user = await userService.create({
    name: USER_NAME,
    email: USER_EMAIL,
    imageUrl: null,
  });
  console.log(`Seeded user "${USER_NAME}" (${user.id})`);
}

// Both checks: a DB migrated with the 013 backfill has the workspace and the
// sheet already; a partially seeded one must not get a second copy of either.
const existingWorkspace = await prisma.workspace.findFirst({
  where: { name: SHEET_NAME },
  select: { id: true },
});
const existingSheet = await prisma.spreadsheet.findFirst({
  where: { name: SHEET_NAME },
  select: { id: true },
});

if (existingWorkspace || existingSheet) {
  console.log(`Seed skipped: "${SHEET_NAME}" already exists`);
} else {
  const workspace = await workspaceService.create({ name: SHEET_NAME });
  const sheetId = workspace.spreadsheetId;
  if (!sheetId) throw new Error("workspace.create returned no spreadsheetId");
  // Explicit node/prompt: this calls the service beneath the zod layer, so
  // the schema defaults do not apply.
  for (const { name, type } of COLUMNS) {
    await spreadsheetCellsService.createColumn({
      id: sheetId,
      name,
      type,
      node: null,
      prompt: null,
    });
  }
  for (const [rowIndex, values] of ROWS.entries()) {
    await spreadsheetCellsService.updateRow({
      id: sheetId,
      rowIndex,
      cells: values
        .map((value, columnIndex) => ({ columnIndex, value }))
        .filter((cell) => cell.value !== null),
    });
  }
  console.log(`Seeded "${SHEET_NAME}" (workspace ${workspace.id})`);
}

await prisma.$disconnect();
