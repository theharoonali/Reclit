import {
  Injectable,
  Module,
  type OnApplicationShutdown,
  type OnModuleInit,
} from "@nestjs/common";
import { describeError } from "../../common/errors";
import { runAiFeed } from "./run-ai.feed";

// The feed's Nest lifecycle, kept apart from run-ai.feed.ts so that file stays
// decorator-free (docs/rules/BACKEND.md hard rule 1). No controller: runs are
// created by `runAi.runCell` and transitioned by the Trigger.dev task.

@Injectable()
class RunAiFeedLifecycle implements OnModuleInit, OnApplicationShutdown {
  /** Eager, so the first subscriber never waits on the LISTEN handshake. */
  async onModuleInit(): Promise<void> {
    // The api still boots without the feed: /health reports the database,
    // and the first subscription retries the connection itself.
    await runAiFeed.ensureStarted().catch((error: unknown) => {
      console.error(
        "[run-ai feed] not listening:",
        describeError(error).message,
      );
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await runAiFeed.stop();
  }
}

@Module({
  providers: [RunAiFeedLifecycle],
})
export class RunAiModule {}
