import { Body, Controller, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { upsertRunAiTestInput } from "./run-ai.schema";
import { runAiService } from "./run-ai.service";

// The REST face of run-ai: a test endpoint that creates or transitions a run
// with a plain JSON body, so the live stream can be driven from curl or
// Postman before real AI execution exists. Domain and Zod errors are mapped
// to HTTP statuses by the global DomainErrorFilter.

@Controller("run-ai")
export class RunAiController {
  /** 201 when a run was created (no `id` in the body), 200 when transitioned. */
  @Post("test")
  async test(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const { run, created } = await runAiService.upsertForTest(
      upsertRunAiTestInput.parse(body),
    );
    res.status(created ? 201 : 200);
    return run;
  }
}
