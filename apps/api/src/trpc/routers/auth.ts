import { loginInput } from "../../modules/auth/auth.schema";
import { authService } from "../../modules/auth/auth.service";
import { createTRPCRouter, mapDomainError, publicProcedure } from "../init";

// Env-backed login — no table (docs/features/auth.md). login/logout write the
// session cookie through the context, so this file stays transport-free for
// the direct test caller (which has no cookie setters).

export const authRouter = createTRPCRouter({
  session: publicProcedure.query(({ ctx }) => ({
    authenticated: ctx.authenticated,
    devMode: ctx.devMode,
  })),

  login: publicProcedure.input(loginInput).mutation(async ({ ctx, input }) => {
    const token = await authService
      .login(input.email, input.password)
      .catch(mapDomainError);
    ctx.setSessionCookie?.(token);
    return { ok: true as const };
  }),

  logout: publicProcedure.mutation(({ ctx }) => {
    ctx.clearSessionCookie?.();
    return { ok: true as const };
  }),
});
