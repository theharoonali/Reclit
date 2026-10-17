import {
  Injectable,
  Module,
  type OnApplicationShutdown,
  type OnModuleInit,
} from "@nestjs/common";
import { describeError } from "../../common/errors";
import { AssistantController } from "./assistant.controller";
import { assistantFeed } from "./assistant.feed";

// The feed's Nest lifecycle, kept apart from assistant.feed.ts so that file
// stays decorator-free (docs/rules/BACKEND.md hard rule 1), plus the one REST
// route (the mic's transcription). Runs are created by `assistant.start` and
// transitioned by the Trigger.dev task.

@Injectable()
class AssistantFeedLifecycle implements OnModuleInit, OnApplicationShutdown {
  /** Eager, so the first subscriber never waits on the LISTEN handshake. */
  async onModuleInit(): Promise<void> {
    // The api still boots without the feed: /health reports the database,
    // and the first subscription retries the connection itself.
    await assistantFeed.ensureStarted().catch((error: unknown) => {
      console.error(
        "[assistant feed] not listening:",
        describeError(error).message,
      );
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await assistantFeed.stop();
  }
}

@Module({
  controllers: [AssistantController],
  providers: [AssistantFeedLifecycle],
})
export class AssistantModule {}
