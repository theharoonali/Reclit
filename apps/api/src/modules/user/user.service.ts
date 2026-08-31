import { prisma } from "../../db/prisma";
import { UserNotFoundError } from "./user.errors";
import type {
  CreateUserInput,
  UpdateUserInput,
  UserProfile,
} from "./user.schema";

// Framework-free: no @nestjs/* imports, no decorators — src/trpc/** imports
// the singleton below. There is no auth, so "the current user" is the first
// (and only) user by createdAt; `me()` is the single place that resolves it.

const userSelect = {
  id: true,
  name: true,
  email: true,
  imageUrl: true,
  createdAt: true,
  updatedAt: true,
} as const;

export class UserService {
  async me(): Promise<UserProfile> {
    const record = await prisma.user.findFirst({
      select: userSelect,
      orderBy: { createdAt: "asc" },
    });
    if (!record) throw new UserNotFoundError();
    return record;
  }

  async update(input: UpdateUserInput): Promise<UserProfile> {
    const { id } = await this.me();
    return prisma.user.update({
      where: { id },
      data: input,
      select: userSelect,
    });
  }

  /** Seed-only; there is no create procedure. */
  async create(input: CreateUserInput): Promise<UserProfile> {
    return prisma.user.create({
      data: { name: input.name, email: input.email, imageUrl: input.imageUrl },
      select: userSelect,
    });
  }
}

export const userService = new UserService();
