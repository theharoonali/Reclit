/**
 * CONTRACT — note
 * Feature doc: docs/features/note.md · Rules: docs/rules/TESTING.md
 *
 * TABLE `Note`
 *   id         String    pk, uuid
 *   title      String    required, trimmed, 1..200
 *   content    String    default "", max 10000
 *   createdAt  DateTime  now(), indexed
 *   updatedAt  DateTime  @updatedAt
 *
 * MODEL  Note = {
 *   id: string; title: string; content: string;
 *   createdAt: Date; updatedAt: Date;
 * }
 * Dates cross the wire as real Date objects (superjson).
 *
 * PROCEDURES
 * | Procedure   | Kind     | Payload                                  | Response            | Errors                 |
 * | ----------- | -------- | ---------------------------------------- | ------------------- | ---------------------- |
 * | note.list   | query    | —                                        | Note[], newest first| —                      |
 * | note.byId   | query    | { id: string }                           | Note                | NOT_FOUND              |
 * | note.create | mutation | { title: string; content?: string }      | Note                | BAD_REQUEST            |
 * | note.update | mutation | { id: string; title?: string; content?: string } | Note         | BAD_REQUEST, NOT_FOUND |
 * | note.remove | mutation | { id: string }                           | { id: string }      | NOT_FOUND              |
 *
 * NOTES
 * - `update` is partial: omitted fields keep their stored value.
 * - `create` omitting `content` stores "".
 * - `list` returns every row: no pagination, search, or sort input.
 * - Every procedure is public; there is no auth yet.
 * - Deleting is immediate and unconditional; there is no soft delete.
 */

import { afterAll, describe, expect, it } from "bun:test";
import { pingDatabase } from "../db/prisma";
import { noteService } from "../modules/note/note.service";
import { caller, expectDate, expectTRPCError } from "./support/trpc";

// Skips (rather than fails) when DATABASE_URL points nowhere, so a checkout
// without a reachable database still passes CI.
const dbUp = await pingDatabase();

const createdIds: string[] = [];

/** Creates a note and registers it for cleanup. */
async function makeNote(title: string, content?: string) {
  const note = await caller.note.create(
    content === undefined ? { title } : { title, content },
  );
  createdIds.push(note.id);
  return note;
}

afterAll(async () => {
  for (const id of createdIds) {
    await noteService.remove(id).catch(() => {});
  }
});

describe.skipIf(!dbUp)("note.create", () => {
  it("creates from the minimal payload and defaults content to an empty string", async () => {
    const note = await makeNote("minimal payload");
    expect(note.title).toBe("minimal payload");
    expect(note.content).toBe("");
  });

  it("creates from the full payload and returns the whole model", async () => {
    const note = await makeNote("full payload", "body text");
    expect(note).toMatchObject({ title: "full payload", content: "body text" });
    expect(typeof note.id).toBe("string");
    expectDate(note.createdAt);
    expectDate(note.updatedAt);
  });

  it("trims the title", async () => {
    const note = await makeNote("  padded  ");
    expect(note.title).toBe("padded");
  });

  it("rejects a blank title", async () => {
    await expectTRPCError(caller.note.create({ title: "  " }), "BAD_REQUEST");
  });

  it("rejects a title over 200 characters", async () => {
    await expectTRPCError(
      caller.note.create({ title: "x".repeat(201) }),
      "BAD_REQUEST",
    );
  });
});

describe.skipIf(!dbUp)("note.byId", () => {
  it("reads back a created note", async () => {
    const created = await makeNote("readable", "read me");
    const note = await caller.note.byId({ id: created.id });
    expect(note).toMatchObject({
      id: created.id,
      title: "readable",
      content: "read me",
    });
  });

  it("returns NOT_FOUND for a missing id", async () => {
    await expectTRPCError(
      caller.note.byId({ id: "does-not-exist" }),
      "NOT_FOUND",
    );
  });
});

describe.skipIf(!dbUp)("note.list", () => {
  it("includes created notes, newest first", async () => {
    const older = await makeNote("older");
    const newer = await makeNote("newer");
    const notes = await caller.note.list();
    const olderIndex = notes.findIndex((n) => n.id === older.id);
    const newerIndex = notes.findIndex((n) => n.id === newer.id);
    expect(olderIndex).toBeGreaterThanOrEqual(0);
    expect(newerIndex).toBeGreaterThanOrEqual(0);
    expect(newerIndex).toBeLessThan(olderIndex);
  });
});

describe.skipIf(!dbUp)("note.update", () => {
  it("updates the title without blanking the content", async () => {
    const note = await makeNote("before", "keep me");
    const updated = await caller.note.update({ id: note.id, title: "after" });
    expect(updated).toMatchObject({ title: "after", content: "keep me" });
  });

  it("updates every field at once", async () => {
    const note = await makeNote("both", "old body");
    const updated = await caller.note.update({
      id: note.id,
      title: "new title",
      content: "new body",
    });
    expect(updated).toMatchObject({
      title: "new title",
      content: "new body",
    });
  });

  it("rejects a blank title", async () => {
    const note = await makeNote("guarded");
    await expectTRPCError(
      caller.note.update({ id: note.id, title: " " }),
      "BAD_REQUEST",
    );
  });

  it("returns NOT_FOUND for a missing id", async () => {
    await expectTRPCError(
      caller.note.update({ id: "does-not-exist", title: "x" }),
      "NOT_FOUND",
    );
  });
});

describe.skipIf(!dbUp)("note.remove", () => {
  it("removes the note and makes it unreadable", async () => {
    const note = await makeNote("temporary");
    const removed = await caller.note.remove({ id: note.id });
    expect(removed).toEqual({ id: note.id });
    createdIds.splice(createdIds.indexOf(note.id), 1);
    await expectTRPCError(caller.note.byId({ id: note.id }), "NOT_FOUND");
  });

  it("returns NOT_FOUND for a missing id", async () => {
    await expectTRPCError(
      caller.note.remove({ id: "does-not-exist" }),
      "NOT_FOUND",
    );
  });
});

describe.skipIf(dbUp)("note contract (no database configured)", () => {
  it("is skipped without a reachable DATABASE_URL", () => {
    expect(dbUp).toBe(false);
  });
});
