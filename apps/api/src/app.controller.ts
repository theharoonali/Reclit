import { Controller, Get, Res } from "@nestjs/common";
import type { Response } from "express";
import { pingDatabase } from "./db/prisma";

@Controller()
export class AppController {
  @Get("health")
  async health(@Res({ passthrough: true }) res: Response) {
    const dbUp = await pingDatabase();
    res.status(dbUp ? 200 : 503);
    return { status: dbUp ? "ok" : "degraded", db: dbUp ? "ok" : "down" };
  }
}
