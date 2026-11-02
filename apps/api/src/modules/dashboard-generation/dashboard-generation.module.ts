import {
  Injectable,
  Module,
  type OnApplicationShutdown,
  type OnModuleInit,
} from "@nestjs/common";
import { describeError } from "../../common/errors";
import { dashboardGenerationFeed } from "./dashboard-generation.feed";

// The feed's Nest lifecycle, kept apart from dashboard-generation.feed.ts so
// that file stays decorator-free (docs/rules/BACKEND.md hard rule 1).
// Generations are created by `dashboardGeneration.start` (and
// `onboarding.finish`) and transitioned by the Trigger.dev task.

@Injectable()
class DashboardGenerationFeedLifecycle
  implements OnModuleInit, OnApplicationShutdown
{
  /** Eager, so the first subscriber never waits on the LISTEN handshake. */
  async onModuleInit(): Promise<void> {
    await dashboardGenerationFeed.ensureStarted().catch((error: unknown) => {
      console.error(
        "[dashboard-generation feed] not listening:",
        describeError(error).message,
      );
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await dashboardGenerationFeed.stop();
  }
}

@Module({
  providers: [DashboardGenerationFeedLifecycle],
})
export class DashboardGenerationModule {}
