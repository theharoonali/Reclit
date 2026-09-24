import { Module } from "@nestjs/common";
import { PopulateController } from "./populate.controller";

@Module({ controllers: [PopulateController] })
export class PopulateModule {}
