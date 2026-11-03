import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import type { Request } from "express";
import { LoginRequiredError } from "../modules/auth/auth.errors";
import { requestToken } from "../modules/auth/auth.request";
import { authService } from "../modules/auth/auth.service";

// The REST twin of tRPC's `protectedProcedure` (docs/features/auth.md): the
// same token, read from the same places, or DEV=TRUE. A refusal is a
// `LoginRequiredError`, which DomainErrorFilter answers as 401
// `{ code: "LOGIN_REQUIRED" }`. Nest code — never imported under src/trpc/.

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (authService.devMode()) return true;
    const request = context.switchToHttp().getRequest<Request>();
    if (authService.verify(requestToken(request.headers))) return true;
    throw new LoginRequiredError();
  }
}
