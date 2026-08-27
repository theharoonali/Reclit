import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { PrismaModule } from "./db/prisma.module";
import { FileModule } from "./modules/file/file.module";
import { SpreadsheetModule } from "./modules/spreadsheet/spreadsheet.module";

@Module({
  imports: [PrismaModule, SpreadsheetModule, FileModule],
  controllers: [AppController],
})
export class AppModule {}
