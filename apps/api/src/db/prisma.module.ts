import { Injectable, Module, type OnApplicationShutdown } from "@nestjs/common";
import { disconnectPrisma } from "./prisma";

// Kept separate from prisma.ts: that file must stay decorator-free because
// src/trpc/** reaches it through the services (AGENTS.md invariant 2).

@Injectable()
class PrismaLifecycle implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    await disconnectPrisma();
  }
}

/** Closes the Postgres pool on `app.close()` / SIGINT / SIGTERM. */
@Module({ providers: [PrismaLifecycle] })
export class PrismaModule {}
