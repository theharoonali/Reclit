import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { TRPCError } from "@trpc/server";
import { pingDatabase } from "../db/prisma";
import { noteService } from "../modules/note/note.service";
import { createCallerFactory } from "../trpc/init";
import { appRouter } from "../trpc/routers/_app";

// Skips (rather than fails) when DATABASE_URL points nowhere, so a checkout
// without a reachable database still passes CI.
const dbUp = await pingDatabase();

const caller = createCallerFactory(appRouter)({});
const createdIds: string[] = [];

/**
 * Asserts a procedure rejects with a given tRPC code.
 * Note: do not use `expect(p).rejects.toThrow(/regex/)` here — it hangs in
 * bun 1.3.9 against TRPCError rejections.
 */
async function expectTRPCError(
  promise: Promise<unknown>,
  code: TRPCError["code"],
): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(TRPCError);
  expect((caught as TRPCError).code).toBe(code);
}

afterAll(async () => {
  for (const id of createdIds) {
    await noteService.remove(id).catch(() => {});
  }
});

describe.skipIf(!dbUp)("note router (requires a database)", () => {
  let id: string;

  beforeAll(async () => {
    const note = await caller.note.create({
      title: "test note",
      content: "created by note.test.ts",
    });
    id = note.id;
    createdIds.push(id);
  });

  it("creates and reads back a note", async () => {
    const note = await caller.note.byId({ id });
    expect(note.title).toBe("test note");
    expect(note.content).toBe("created by note.test.ts");
  });

  it("lists the note", async () => {
    const notes = await caller.note.list();
    expect(notes.some((n) => n.id === id)).toBe(true);
  });

  it("updates the title without blanking the content", async () => {
    const updated = await caller.note.update({ id, title: "renamed" });
    expect(updated.title).toBe("renamed");
    expect(updated.content).toBe("created by note.test.ts");
  });

  it("rejects an empty title", async () => {
    await expectTRPCError(
      caller.note.create({ title: "  ", content: "" }),
      "BAD_REQUEST",
    );
  });

  it("returns NOT_FOUND for a missing id", async () => {
    await expectTRPCError(
      caller.note.byId({ id: "does-not-exist" }),
      "NOT_FOUND",
    );
  });

  it("returns NOT_FOUND when updating a missing id", async () => {
    await expectTRPCError(
      caller.note.update({ id: "does-not-exist", title: "x" }),
      "NOT_FOUND",
    );
  });

  it("removes the note", async () => {
    await caller.note.remove({ id });
    createdIds.length = 0;
    await expectTRPCError(caller.note.byId({ id }), "NOT_FOUND");
  });
});

describe.skipIf(dbUp)("note router (no database configured)", () => {
  it("is skipped without a reachable DATABASE_URL", () => {
    expect(dbUp).toBe(false);
  });
});
