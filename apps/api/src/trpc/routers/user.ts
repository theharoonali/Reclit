import { updateUserInput } from "../../modules/user/user.schema";
import { userService } from "../../modules/user/user.service";
import { createTRPCRouter, mapDomainError, publicProcedure } from "../init";

// Routers validate input and delegate. All DB access lives in the service.
// No auth: `me` is the first (only) user, so there is no id input here.

export const userRouter = createTRPCRouter({
  me: publicProcedure.query(() => userService.me().catch(mapDomainError)),

  update: publicProcedure
    .input(updateUserInput)
    .mutation(({ input }) => userService.update(input).catch(mapDomainError)),
});
