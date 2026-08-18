import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../init";

export const exampleRouter = createTRPCRouter({
  hello: publicProcedure
    .input(z.object({ name: z.string().optional() }).optional())
    .query(({ input }) => {
      return {
        greeting: `Hello, ${input?.name ?? "world"}!`,
        timestamp: new Date().toISOString(),
      };
    }),

  // Example of an authenticated procedure — requires a valid Supabase JWT.
  me: protectedProcedure.query(({ ctx }) => {
    return {
      userId: ctx.session.user.id,
      email: ctx.session.user.email,
    };
  }),
});
