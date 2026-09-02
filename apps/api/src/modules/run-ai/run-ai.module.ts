import {
  Injectable,
  Module,
  type OnApplicationShutdown,
  type OnModuleInit,
} from "@nestjs/common";
import { RunAiController } from "./run-ai.controller";
import { runAiFeed } from "./run-ai.feed";

// Kept separate from run-ai.feed.ts: that file must stay decorator-free
// because src/trpc/** reaches it through the service (AGENTS.md invariant 2).

@Injectable()
class RunAiFeedLifecycle implements OnModuleInit, OnApplicationShutdown {
  /** Eager, so the first subscriber never waits on the LISTEN handshake. */
  async onModuleInit(): Promise<void> {
    // The api still boots without the feed: /health reports the database,
    // and the first subscription retries the connection itself.
    await runAiFeed.ensureStarted().catch((error: unknown) => {
      console.error(
        "[run-ai feed] not listening:",
        error instanceof Error ? error.message : error,
      );
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await runAiFeed.stop();
  }
}

@Module({
  controllers: [RunAiController],
  providers: [RunAiFeedLifecycle],
})
export class RunAiModule {}
