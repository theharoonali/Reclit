import { Module } from "@nestjs/common";
import { SpreadsheetController } from "./spreadsheet.controller";

@Module({
  controllers: [SpreadsheetController],
})
export class SpreadsheetModule {}
