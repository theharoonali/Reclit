import { loginInput } from "../../modules/auth/auth.schema";
import { authService } from "../../modules/auth/auth.service";
import { createTRPCRouter, mapDomainError, publicProcedure } from "../init";

// Env-backed login — no table (docs/features/auth.md). `login` answers the
// session token (the client sends it back as a bearer token) and also writes
// it to the cookie through the context; logout clears the cookie. The context
// setters keep this file transport-free for the direct test caller.

export const authRouter = createTRPCRouter({
  session: publicProcedure.query(({ ctx }) => ({
    authenticated: ctx.authenticated,
    devMode: ctx.devMode,
  })),

  login: publicProcedure.input(loginInput).mutation(async ({ ctx, input }) => {
    const session = await authService
      .login(input.email, input.password)
      .catch(mapDomainError);
    ctx.setSessionCookie?.(session.token);
    return {
      ok: true as const,
      token: session.token,
      expiresAt: session.expiresAt,
    };
  }),

  logout: publicProcedure.mutation(({ ctx }) => {
    ctx.clearSessionCookie?.();
    return { ok: true as const };
  }),
});
