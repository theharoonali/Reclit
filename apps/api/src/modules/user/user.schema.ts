import { z } from "zod";

// Single source of truth for the user shapes. There is no auth: the app has
// exactly one user (seeded), so there is no id input anywhere on this surface.

const name = z.string().trim().min(1, "Name is required").max(200);
const email = z.string().trim().email().max(320);

/** `null` clears the field (email or picture); omitted leaves it alone. */
export const updateUserInput = z
  .object({
    name,
    email: email.nullable(),
    imageUrl: z.string().url().max(2048).nullable(),
  })
  .partial();

export const userProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  imageUrl: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type UpdateUserInput = z.infer<typeof updateUserInput>;
export type UserProfile = z.infer<typeof userProfileSchema>;

/** Seed-only shape; there is no create procedure. */
export const createUserInput = z.object({
  name,
  email: email.nullable().default(null),
  imageUrl: z.string().url().max(2048).nullable().default(null),
});
export type CreateUserInput = z.infer<typeof createUserInput>;
