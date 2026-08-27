import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import { Catch } from "@nestjs/common";
import type { Response } from "express";
import { ZodError } from "zod";
import type { DomainErrorKind } from "./errors";
import { DomainError } from "./errors";

// The REST half of the shared error mapping (tRPC's is `mapDomainError` in
// src/trpc/init.ts). Imported from bootstrap.ts ONLY — this file pulls in
// @nestjs/common, which must never enter the src/trpc/** import graph.

const KIND_TO_STATUS: Record<DomainErrorKind, number> = {
  not_found: 404,
  bad_request: 400,
  conflict: 409,
  unavailable: 503,
  upstream: 502,
};

@Catch(DomainError, ZodError)
export class DomainErrorFilter implements ExceptionFilter {
  catch(exception: DomainError | ZodError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (exception instanceof ZodError) {
      res.status(400).json({
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: exception.issues
          .map(
            (issue) => `${issue.path.join(".") || "input"}: ${issue.message}`,
          )
          .join("; "),
      });
      return;
    }
    const statusCode = KIND_TO_STATUS[exception.kind];
    res.status(statusCode).json({
      statusCode,
      code: exception.code,
      message: exception.message,
    });
  }
}
