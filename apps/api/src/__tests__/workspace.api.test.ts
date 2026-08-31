/**
 * CONTRACT — workspace
 * Feature doc: docs/features/workspace.md · Rules: docs/rules/TESTING.md
 *
 * TABLE `Workspace`
 *   id         String    pk, uuid
 *   name       String    required, 1..200 (trimmed)
 *   ownerId    String    fk cascade → User, indexed
 *   createdAt  DateTime  now(), indexed
 *   updatedAt  DateTime  @updatedAt
 * `Spreadsheet.workspaceId` points back (fk cascade → Workspace, indexed).
 *
 * MODEL  WorkspaceSummary = {
 *   id: string; name: string; spreadsheetId: string | null;
 *   createdAt: Date; updatedAt: Date;
 * }
 * Dates cross the wire as real Date objects (superjson). `spreadsheetId` is
 * derived — the workspace's first sheet by createdAt — and null only when
 * `spreadsheet.remove` orphaned the workspace.
 *
 * PROCEDURES
 * | Procedure        | Kind     | Payload          | Response           | Errors                          |
 * | ---------------- | -------- | ---------------- | ------------------ | ------------------------------- |
 * | workspace.list   | query    | —                | WorkspaceSummary[] | —                               |
 * | workspace.byId   | query    | { id }           | WorkspaceSummary   | NOT_FOUND                       |
 * | workspace.create | mutation | { name: 1..200 } | WorkspaceSummary   | BAD_REQUEST                     |
 * | workspace.rename | mutation | { id; name }     | WorkspaceSummary   | NOT_FOUND, BAD_REQUEST          |
 * | workspace.remove | mutation | { id }           | { id }             | NOT_FOUND, CONFLICT (last)      |
 *
 * NOTES
 * - `list` is ordered createdAt ascending — stable menu order, oldest first.
 * - `create` also creates the workspace's spreadsheet, named after the
 *   workspace, in the same transaction; the owner is the app's single user
 *   (`user.me`). On a never-seeded database (empty `User` table) it fails
 *   NOT_FOUND (`USER_NOT_FOUND`) — unreachable after seed/backfill and not
 *   staged by this file.
 * - `rename` renames the workspace AND its sheets in one transaction — the
 *   sheet's name is the workspace's name by design.
 * - `remove` refuses to delete the owner's last workspace (CONFLICT, code
 *   WORKSPACE_LAST) — a user must always keep one; otherwise the fk cascade
 *   deletes the workspace's sheets and, transitively, their
 *   columns/rows/cells.
 * - The schema is one-to-many (future scope); the app creates exactly one
 *   sheet per workspace today and `spreadsheetId` exposes it.
 * - Every procedure is public; there is no auth yet.
 */

import { afterAll, describe, expect, it } from "bun:test";
import { pingDatabase } from "../db/prisma";
import {
  ensureUser,
  makeIsolatedOwnerWorkspace,
  removeUser,
  removeWorkspace,
} from "./support/fixtures";
import { caller, expectDate, expectTRPCError } from "./support/trpc";

// Skips (rather than fails) when DATABASE_URL points nowhere, so a checkout
// without a reachable database still passes CI.
const dbUp = await pingDatabase();

if (dbUp) await ensureUser();

const createdIds: string[] = [];

/** Creates a workspace and registers it for cleanup. */
async function makeWs(name = "contract ws") {
  const workspace = await caller.workspace.create({ name });
  createdIds.push(workspace.id);
  return workspace;
}

afterAll(async () => {
  for (const id of createdIds) {
    await removeWorkspace(id);
  }
});

describe.skipIf(!dbUp)("workspace.create", () => {
  it("creates the workspace and its same-named sheet", async () => {
    const workspace = await makeWs("created ws");
    expect(workspace.name).toBe("created ws");
    expect(workspace.spreadsheetId).not.toBeNull();
    expectDate(workspace.createdAt);
    expectDate(workspace.updatedAt);
    const sheet = await caller.spreadsheet.byId({
      id: workspace.spreadsheetId as string,
    });
    expect(sheet.name).toBe("created ws");
    expect(sheet.totalRows).toBe(5_000_000);
  });

  it("rejects a blank name", async () => {
    await expectTRPCError(
      caller.workspace.create({ name: "  " }),
      "BAD_REQUEST",
    );
  });
});

describe.skipIf(!dbUp)("workspace.byId", () => {
  it("reads back a created workspace", async () => {
    const created = await makeWs("readable ws");
    const workspace = await caller.workspace.byId({ id: created.id });
    expect(workspace).toMatchObject({
      id: created.id,
      name: "readable ws",
      spreadsheetId: created.spreadsheetId,
    });
  });

  it("returns NOT_FOUND for a missing id", async () => {
    await expectTRPCError(
      caller.workspace.byId({ id: "does-not-exist" }),
      "NOT_FOUND",
    );
  });
});

describe.skipIf(!dbUp)("workspace.list", () => {
  it("includes created workspaces, oldest first", async () => {
    const older = await makeWs("older ws");
    const newer = await makeWs("newer ws");
    const workspaces = await caller.workspace.list();
    const olderIndex = workspaces.findIndex((w) => w.id === older.id);
    const newerIndex = workspaces.findIndex((w) => w.id === newer.id);
    expect(olderIndex).toBeGreaterThanOrEqual(0);
    expect(newerIndex).toBeGreaterThanOrEqual(0);
    expect(olderIndex).toBeLessThan(newerIndex);
  });
});

describe.skipIf(!dbUp)("workspace.rename", () => {
  it("renames the workspace and its sheet together", async () => {
    const workspace = await makeWs("before rename");
    const renamed = await caller.workspace.rename({
      id: workspace.id,
      name: "after rename",
    });
    expect(renamed).toMatchObject({ id: workspace.id, name: "after rename" });
    const sheet = await caller.spreadsheet.byId({
      id: workspace.spreadsheetId as string,
    });
    expect(sheet.name).toBe("after rename");
  });

  it("rejects a blank name", async () => {
    const workspace = await makeWs("blank rename");
    await expectTRPCError(
      caller.workspace.rename({ id: workspace.id, name: " " }),
      "BAD_REQUEST",
    );
  });

  it("returns NOT_FOUND for a missing id", async () => {
    await expectTRPCError(
      caller.workspace.rename({ id: "does-not-exist", name: "x" }),
      "NOT_FOUND",
    );
  });
});

describe.skipIf(!dbUp)("workspace.remove", () => {
  it("removes the workspace and cascades its sheet", async () => {
    const workspace = await makeWs("removable ws");
    const removed = await caller.workspace.remove({ id: workspace.id });
    expect(removed).toEqual({ id: workspace.id });
    createdIds.splice(createdIds.indexOf(workspace.id), 1);
    await expectTRPCError(
      caller.workspace.byId({ id: workspace.id }),
      "NOT_FOUND",
    );
    await expectTRPCError(
      caller.spreadsheet.byId({ id: workspace.spreadsheetId as string }),
      "NOT_FOUND",
    );
  });

  it("returns NOT_FOUND for a missing id", async () => {
    await expectTRPCError(
      caller.workspace.remove({ id: "does-not-exist" }),
      "NOT_FOUND",
    );
  });

  it("refuses to delete the owner's last workspace", async () => {
    // Staged with an isolated owner so "last" is deterministic without
    // touching the shared user's workspaces.
    const { userId, workspaceId } = await makeIsolatedOwnerWorkspace();
    try {
      await expectTRPCError(
        caller.workspace.remove({ id: workspaceId }),
        "CONFLICT",
      );
      const stillThere = await caller.workspace.byId({ id: workspaceId });
      expect(stillThere.id).toBe(workspaceId);
    } finally {
      await removeUser(userId);
    }
  });
});
