import { updateUserInput } from "../../modules/user/user.schema";
import { userService } from "../../modules/user/user.service";
import { createTRPCRouter, mapDomainError, protectedProcedure } from "../init";

// Routers validate input and delegate. All DB access lives in the service.
// Auth is a single env-backed user (docs/features/auth.md): `me` is still the
// first (only) database user, so there is no id input here, but both
// procedures now require a session (or DEV=TRUE).

export const userRouter = createTRPCRouter({
  me: protectedProcedure.query(() => userService.me().catch(mapDomainError)),

  update: protectedProcedure
    .input(updateUserInput)
    .mutation(({ input }) => userService.update(input).catch(mapDomainError)),
});
