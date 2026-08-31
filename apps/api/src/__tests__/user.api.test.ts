/**
 * CONTRACT — user
 * Feature doc: docs/features/user.md · Rules: docs/rules/TESTING.md
 *
 * TABLE `User`
 *   id         String    pk, uuid
 *   name       String    required, 1..200 (trimmed)
 *   email      String?   valid email, <= 320 (trimmed); null = no email
 *   imageUrl   String?   http(s) URL, <= 2048; null = no picture
 *   createdAt  DateTime  now()
 *   updatedAt  DateTime  @updatedAt
 *
 * MODEL  UserProfile = {
 *   id: string; name: string; email: string | null; imageUrl: string | null;
 *   createdAt: Date; updatedAt: Date;
 * }
 * Dates cross the wire as real Date objects (superjson).
 *
 * PROCEDURES
 * | Procedure   | Kind     | Payload                                                        | Response    | Errors      |
 * | ----------- | -------- | -------------------------------------------------------------- | ----------- | ----------- |
 * | user.me     | query    | —                                                              | UserProfile | —           |
 * | user.update | mutation | { name?: 1..200; email?: email \| null; imageUrl?: url \| null } | UserProfile | BAD_REQUEST |
 *
 * NOTES
 * - There is no auth. The app has exactly one user (seeded as "Demo User");
 *   `me` resolves the first user by createdAt, so no procedure takes an id.
 * - On a database that was never seeded (empty `User` table) both procedures
 *   fail NOT_FOUND (`USER_NOT_FOUND`). That state is unreachable once the
 *   seed or the 013 backfill ran, and staging it would mean emptying the
 *   table, so this file does not produce it.
 * - `update` is partial: an omitted field is untouched, `imageUrl: null`
 *   clears the picture.
 * - There is no create or remove procedure; the user exists from the seed
 *   (`bun run --filter=@reclit/api db:seed`) or the 013 backfill migration.
 * - The user owns workspaces (see the workspace contract); deleting the user
 *   would cascade them, which is why no remove procedure exists.
 * - Every procedure is public; there is no auth yet.
 */

import { afterAll, describe, expect, it } from "bun:test";
import { pingDatabase } from "../db/prisma";
import { ensureUser } from "./support/fixtures";
import { caller, expectDate, expectTRPCError } from "./support/trpc";

// Skips (rather than fails) when DATABASE_URL points nowhere, so a checkout
// without a reachable database still passes CI.
const dbUp = await pingDatabase();

// There is only one user; tests mutate and restore it rather than create one.
let original: Awaited<ReturnType<typeof ensureUser>> | undefined;
if (dbUp) {
  original = await ensureUser();
}

afterAll(async () => {
  if (original) {
    await caller.user
      .update({
        name: original.name,
        email: original.email,
        imageUrl: original.imageUrl,
      })
      .catch(() => {});
  }
});

describe.skipIf(!dbUp)("user.me", () => {
  it("returns the single user's profile", async () => {
    const me = await caller.user.me();
    expect(me).toMatchObject({ id: original?.id });
    expect(typeof me.name).toBe("string");
    expect(me.email === null || typeof me.email === "string").toBe(true);
    expect(me.imageUrl === null || typeof me.imageUrl === "string").toBe(true);
    expectDate(me.createdAt);
    expectDate(me.updatedAt);
  });
});

describe.skipIf(!dbUp)("user.update", () => {
  it("updates name, email and imageUrl together", async () => {
    const updated = await caller.user.update({
      name: "Contract Renamed",
      email: "contract@example.com",
      imageUrl: "https://example.com/avatar.png",
    });
    expect(updated).toMatchObject({
      id: original?.id,
      name: "Contract Renamed",
      email: "contract@example.com",
      imageUrl: "https://example.com/avatar.png",
    });
  });

  it("clears email with null", async () => {
    const cleared = await caller.user.update({ email: null });
    expect(cleared.email).toBe(null);
  });

  it("leaves omitted fields untouched and clears imageUrl with null", async () => {
    await caller.user.update({ imageUrl: "https://example.com/a.png" });
    const nameOnly = await caller.user.update({ name: "Partial Update" });
    expect(nameOnly.imageUrl).toBe("https://example.com/a.png");
    const cleared = await caller.user.update({ imageUrl: null });
    expect(cleared).toMatchObject({ name: "Partial Update", imageUrl: null });
  });

  it("rejects a blank name", async () => {
    await expectTRPCError(caller.user.update({ name: "  " }), "BAD_REQUEST");
  });

  it("rejects an invalid email", async () => {
    await expectTRPCError(
      caller.user.update({ email: "not-an-email" }),
      "BAD_REQUEST",
    );
  });

  it("rejects a non-URL imageUrl", async () => {
    await expectTRPCError(
      caller.user.update({ imageUrl: "not a url" }),
      "BAD_REQUEST",
    );
  });
});
