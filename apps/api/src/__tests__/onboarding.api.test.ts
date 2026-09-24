/**
 * CONTRACT — onboarding
 * Feature doc: docs/features/onboarding.md · Rules: docs/rules/TESTING.md
 *
 * TABLE  no table of its own. It writes `User.onboardingCompleted` (see the
 * user contract), one `Workspace` + its `Spreadsheet` (see the workspace
 * contract) and the imported grid (see the spreadsheet contract, IMPORT).
 *
 * MODEL  OnboardingResult = {
 *   user: UserProfile;            // onboardingCompleted: true
 *   workspace: WorkspaceSummary;  // the new workspace, owned by `user`
 *   import: { rowCount: number; cellCount: number; totalColumns: number };
 * }
 * Dates are ISO strings on the wire (plain JSON, no superjson on REST).
 *
 * ROUTES
 * | Route            | Body (multipart)                              | Response              | Errors |
 * | ---------------- | --------------------------------------------- | --------------------- | ------ |
 * | POST /onboarding | file: .csv \| .xlsx (<= 25 MB); name?: 1..200 | 200 OnboardingResult  | 400 (no `file` field, no code) · 400 VALIDATION_FAILED (name > 200) · 400 SPREADSHEET_IMPORT_UNSUPPORTED_TYPE \| _EMPTY \| _NO_HEADER \| _UNREADABLE \| _TOO_LARGE · 409 ONBOARDING_ALREADY_COMPLETED |
 *
 * NOTES
 * - REST only: multipart does not ride the tRPC link. The flag it sets is
 *   read through `user.me` (tRPC).
 * - `name` is optional; omitted or blank, the workspace is named after the
 *   file without its extension ("Q3 leads.csv" → "Q3 leads").
 * - The file is parsed and typed exactly like `POST /spreadsheets/:id/import`
 *   (same inference, same limits, same error codes).
 * - A rejected file writes nothing: no workspace is created and the flag
 *   stays false, so the user can retry.
 * - It runs once. With the flag already true it answers 409 before reading
 *   the file.
 * - Every route is public; there is no auth yet. "The user" is `user.me`.
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import { pingDatabase, prisma } from "../db/prisma";
import { ensureUser, removeWorkspace } from "./support/fixtures";
import type { TestServer } from "./support/http";
import { startTestServer } from "./support/http";
import { caller } from "./support/trpc";
import { csvBody, xlsxBody } from "./support/upload";

// Skips (rather than fails) when DATABASE_URL points nowhere, so a checkout
// without a reachable database still passes CI.
const dbUp = await pingDatabase();

type OnboardingResult = {
  user: { id: string; onboardingCompleted: boolean };
  workspace: { id: string; name: string; spreadsheetId: string | null };
  import: { rowCount: number; cellCount: number; totalColumns: number };
};

describe.skipIf(!dbUp)("POST /onboarding", () => {
  let server: TestServer;
  let baseUrl = "";
  let userId = "";
  let originalFlag = true;
  const created: string[] = [];

  // There is only one user; its flag is flipped back to false before every
  // test (straight through prisma — no procedure un-onboards) and restored
  // after the suite.
  const resetFlag = () =>
    prisma.user.update({
      where: { id: userId },
      data: { onboardingCompleted: false },
    });

  const workspaceCount = () =>
    prisma.workspace.count({ where: { ownerId: userId } });

  async function onboard(body: FormData) {
    const res = await fetch(`${baseUrl}/onboarding`, { method: "POST", body });
    const json = (await res.json()) as OnboardingResult & { code?: string };
    if (res.status === 200) created.push(json.workspace.id);
    return { res, json };
  }

  beforeAll(async () => {
    const user = await ensureUser();
    userId = user.id;
    originalFlag = user.onboardingCompleted;
    server = await startTestServer();
    baseUrl = server.baseUrl;
  });

  beforeEach(async () => {
    await resetFlag();
  });

  afterAll(async () => {
    for (const id of created) await removeWorkspace(id);
    await prisma.user
      .update({
        where: { id: userId },
        data: { onboardingCompleted: originalFlag },
      })
      .catch(() => {});
    await server?.close();
  });

  it("creates a workspace owned by the user from a CSV and completes onboarding", async () => {
    const { res, json } = await onboard(
      csvBody("Name,Age\nAda,36\nAlan,41\n", "people.csv"),
    );
    expect(res.status).toBe(200);
    expect(json.user).toMatchObject({ id: userId, onboardingCompleted: true });
    expect(json.workspace.name).toBe("people");
    expect(json.import).toEqual({ rowCount: 2, cellCount: 4, totalColumns: 2 });

    const owner = await prisma.workspace.findUnique({
      where: { id: json.workspace.id },
      select: { ownerId: true },
    });
    expect(owner?.ownerId).toBe(userId);

    const sheetId = json.workspace.spreadsheetId;
    if (!sheetId) throw new Error("expected the workspace's sheet");
    const payload = await caller.spreadsheet.rows({ id: sheetId });
    expect(payload.columns.map((column) => column.name)).toEqual([
      "Name",
      "Age",
    ]);
    expect(payload.rows[0]?.columns).toEqual([
      { id: "col.0", name: "Name", value: "Ada" },
      { id: "col.1", name: "Age", value: 36 },
    ]);

    expect((await caller.user.me()).onboardingCompleted).toBe(true);
  });

  it("imports an .xlsx workbook", async () => {
    const { res, json } = await onboard(
      await xlsxBody(
        [
          ["Company", "Seats"],
          ["Acme", 12],
        ],
        "accounts.xlsx",
      ),
    );
    expect(res.status).toBe(200);
    expect(json.workspace.name).toBe("accounts");
    expect(json.import).toEqual({ rowCount: 1, cellCount: 2, totalColumns: 2 });
  });

  it("uses a given name, trimmed", async () => {
    const body = csvBody("A\nx\n", "data.csv");
    body.append("name", "  Sales pipeline  ");
    const { res, json } = await onboard(body);
    expect(res.status).toBe(200);
    expect(json.workspace.name).toBe("Sales pipeline");
  });

  it("falls back to the file name when the name is blank", async () => {
    const body = csvBody("A\nx\n", "Q3 leads.final.csv");
    body.append("name", "   ");
    const { res, json } = await onboard(body);
    expect(res.status).toBe(200);
    expect(json.workspace.name).toBe("Q3 leads.final");
  });

  it("rejects a name over 200 characters", async () => {
    const body = csvBody("A\nx\n");
    body.append("name", "x".repeat(201));
    const before = await workspaceCount();
    const { res, json } = await onboard(body);
    expect(res.status).toBe(400);
    expect(json.code).toBe("VALIDATION_FAILED");
    expect(await workspaceCount()).toBe(before);
  });

  it("answers 409 once onboarding is completed", async () => {
    expect((await onboard(csvBody("A\nx\n"))).res.status).toBe(200);
    const before = await workspaceCount();
    const { res, json } = await onboard(csvBody("A\nx\n"));
    expect(res.status).toBe(409);
    expect(json.code).toBe("ONBOARDING_ALREADY_COMPLETED");
    expect(await workspaceCount()).toBe(before);
  });

  it("maps every file failure to its code and writes nothing", async () => {
    const cases: [FormData, string][] = [
      [csvBody("x", "notes.txt"), "SPREADSHEET_IMPORT_UNSUPPORTED_TYPE"],
      [csvBody(""), "SPREADSHEET_IMPORT_EMPTY"],
      [csvBody(",,\na,b,c\n"), "SPREADSHEET_IMPORT_NO_HEADER"],
      [
        csvBody(Array.from({ length: 300 }, (_, i) => `c${i}`).join(",")),
        "SPREADSHEET_IMPORT_TOO_LARGE",
      ],
    ];
    const before = await workspaceCount();
    for (const [body, code] of cases) {
      const { res, json } = await onboard(body);
      expect(res.status).toBe(400);
      expect(json.code).toBe(code);
    }
    expect(await workspaceCount()).toBe(before);
    expect((await caller.user.me()).onboardingCompleted).toBe(false);
  });

  it("answers 400 without a file field", async () => {
    const res = await fetch(`${baseUrl}/onboarding`, {
      method: "POST",
      body: new FormData(),
    });
    expect(res.status).toBe(400);
  });
});

describe.skipIf(dbUp)("onboarding contract (no database configured)", () => {
  it("is skipped without a reachable DATABASE_URL", () => {
    expect(dbUp).toBe(false);
  });
});
