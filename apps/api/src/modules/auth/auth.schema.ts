import { z } from "zod";

// Single env-backed dummy user (docs/features/auth.md). No table: the
// credentials live in AUTH_EMAIL / AUTH_PASSWORD and the session is a signed
// httpOnly cookie. DEV=TRUE authenticates every request with no credentials.

const email = z.string().trim().email().max(320);
const password = z.string().min(1, "Password is required").max(200);

export const loginInput = z.object({ email, password });

export const sessionSchema = z.object({
  authenticated: z.boolean(),
  devMode: z.boolean(),
});

export type LoginInput = z.infer<typeof loginInput>;
export type Session = z.infer<typeof sessionSchema>;
