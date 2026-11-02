-- CreateEnum
CREATE TYPE "DashboardGenerationSource" AS ENUM ('ONBOARDING', 'DASHBOARD');

-- CreateTable
CREATE TABLE "DashboardGeneration" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "spreadsheetId" TEXT NOT NULL,
    "source" "DashboardGenerationSource" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "phase" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "awaitBatchId" TEXT,
    "log" JSONB NOT NULL DEFAULT '[]',
    "brief" JSONB,
    "result" JSONB,
    "error" JSONB,
    "model" TEXT,
    "usage" JSONB,
    "triggerRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DashboardGeneration_workspaceId_updatedAt_idx" ON "DashboardGeneration"("workspaceId", "updatedAt");

-- CreateIndex
CREATE INDEX "DashboardGeneration_createdAt_idx" ON "DashboardGeneration"("createdAt");

-- AddForeignKey
ALTER TABLE "DashboardGeneration" ADD CONSTRAINT "DashboardGeneration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardGeneration" ADD CONSTRAINT "DashboardGeneration_spreadsheetId_fkey" FOREIGN KEY ("spreadsheetId") REFERENCES "Spreadsheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One active generation per workspace. The service maps the violation to
-- DASHBOARD_GENERATION_BUSY (409). Terminal statuses: COMPLETED, FAILED, CANCELLED.
CREATE UNIQUE INDEX "DashboardGeneration_active_workspace_key" ON "DashboardGeneration"("workspaceId")
  WHERE "status" NOT IN ('COMPLETED', 'FAILED', 'CANCELLED');

-- Change feed: every insert/update publishes the row id on
-- `dashboard_generation_changed`; the listener re-reads the row. See
-- modules/dashboard-generation/dashboard-generation.feed.ts and src/common/live-feed.ts.
CREATE OR REPLACE FUNCTION dashboard_generation_notify() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('dashboard_generation_changed', NEW."id");
  RETURN NEW;
END;
$$;

CREATE TRIGGER dashboard_generation_notify
AFTER INSERT OR UPDATE ON "DashboardGeneration"
FOR EACH ROW EXECUTE FUNCTION dashboard_generation_notify();
