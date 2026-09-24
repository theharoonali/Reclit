import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { PrismaModule } from "./db/prisma.module";
import { FileModule } from "./modules/file/file.module";
import { PopulateModule } from "./modules/populate/populate.module";
import { RunAiModule } from "./modules/run-ai/run-ai.module";
import { SpreadsheetModule } from "./modules/spreadsheet/spreadsheet.module";

@Module({
  imports: [
    PrismaModule,
    SpreadsheetModule,
    FileModule,
    RunAiModule,
    PopulateModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
