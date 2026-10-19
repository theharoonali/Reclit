import { prisma } from "../src/db/prisma";
import { userService } from "../src/modules/user/user.service";

// Empties every table and leaves one bare user who has not onboarded, so the
// next visit to the dashboard is a genuine first run through the onboarding
// wizard (docs/plans/033-ai-onboarding-wizard.md). Destructive by design:
// nothing is kept. Refuses to run against a production database.
// Run: bun run --filter=@reclit/api db:reset

const USER_NAME = "Demo User";
const USER_EMAIL = "demo@reclit.app";

if (process.env.NODE_ENV === "production") {
  throw new Error("db:reset refuses to run with NODE_ENV=production");
}

// Children before parents. Every cascade would do most of this from `user`
// alone, but RunAi has no foreign key and nothing else references it.
const deleted = await prisma.$transaction([
  prisma.runAi.deleteMany(),
  prisma.assistantRun.deleteMany(),
  prisma.externalApi.deleteMany(),
  prisma.dashboardWidget.deleteMany(),
  prisma.dashboard.deleteMany(),
  prisma.cell.deleteMany(),
  prisma.row.deleteMany(),
  prisma.column.deleteMany(),
  prisma.spreadsheet.deleteMany(),
  prisma.workspace.deleteMany(),
  prisma.user.deleteMany(),
]);
const rows = deleted.reduce((sum, result) => sum + result.count, 0);
console.log(`Reset: removed ${rows} rows across ${deleted.length} tables`);

const user = await userService.create({
  name: USER_NAME,
  email: USER_EMAIL,
  imageUrl: null,
  onboardingCompleted: false,
});
console.log(`Created "${USER_NAME}" (${user.id}); onboarding not completed`);

await prisma.$disconnect();
