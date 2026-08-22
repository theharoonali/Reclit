import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { PrismaModule } from "./db/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [AppController],
})
export class AppModule {}
