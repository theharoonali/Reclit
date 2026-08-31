import { prisma } from "../../db/prisma";
import type { UserProfile } from "../../modules/user/user.schema";
import { userService } from "../../modules/user/user.service";
import { caller } from "./trpc";

// Workspace fixtures shared by contract files (docs/rules/TESTING.md §Setup).
// Every spreadsheet needs a workspace and every workspace needs a user, so
// sheet-creating suites host their fixtures here.

/**
 * The app's single user, created on the fly when the database was never
 * seeded. Never deleted by cleanup — with no auth, `user.me` and every
 * workspace in the suite lean on it.
 */
export async function ensureUser(): Promise<UserProfile> {
  try {
    return await userService.me();
  } catch {
    return userService.create({
      name: "Contract User",
      email: null,
      imageUrl: null,
    });
  }
}

/** A workspace to hang test sheets on. Remove with `removeWorkspace`. */
export async function makeWorkspace(name = "contract workspace") {
  await ensureUser();
  return caller.workspace.create({ name });
}

/**
 * Cleanup-only delete, straight through prisma: the domain rule refusing to
 * delete an owner's last workspace must not leave fixtures behind on an
 * otherwise empty database.
 */
export async function removeWorkspace(id: string): Promise<void> {
  await prisma.workspace.delete({ where: { id } }).catch(() => {});
}

/**
 * A scratch owner with exactly one workspace, built straight through prisma:
 * `workspace.create` always attaches to the app's single `user.me`, so the
 * only way to stage "an owner's last workspace" without touching shared data
 * is to plant an isolated owner. Remove with `removeUser` (cascades the
 * workspace).
 */
export async function makeIsolatedOwnerWorkspace(): Promise<{
  userId: string;
  workspaceId: string;
}> {
  const user = await prisma.user.create({
    data: { name: "Isolated Owner" },
    select: { id: true },
  });
  const workspace = await prisma.workspace.create({
    data: { name: "isolated ws", ownerId: user.id },
    select: { id: true },
  });
  return { userId: user.id, workspaceId: workspace.id };
}

/** Cleanup-only: deletes a scratch user and, by cascade, their workspaces. */
export async function removeUser(id: string): Promise<void> {
  await prisma.user.delete({ where: { id } }).catch(() => {});
}
