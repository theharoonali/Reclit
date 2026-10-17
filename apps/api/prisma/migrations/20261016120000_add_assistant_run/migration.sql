-- CreateEnum
CREATE TYPE "AssistantScope" AS ENUM ('DASHBOARD', 'SPREADSHEET');

-- CreateEnum
CREATE TYPE "AssistantSource" AS ENUM ('USER', 'SYSTEM');

-- CreateTable
CREATE TABLE "AssistantRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "spreadsheetId" TEXT,
    "scope" "AssistantScope" NOT NULL,
    "source" "AssistantSource" NOT NULL DEFAULT 'USER',
    "prompt" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "steps" JSONB NOT NULL DEFAULT '[]',
    "pendingAction" JSONB,
    "summary" TEXT,
    "error" JSONB,
    "model" TEXT,
    "usage" JSONB,
    "transcript" JSONB,
    "triggerRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantRun_workspaceId_updatedAt_idx" ON "AssistantRun"("workspaceId", "updatedAt");

-- CreateIndex
CREATE INDEX "AssistantRun_createdAt_idx" ON "AssistantRun"("createdAt");

-- AddForeignKey
ALTER TABLE "AssistantRun" ADD CONSTRAINT "AssistantRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantRun" ADD CONSTRAINT "AssistantRun_spreadsheetId_fkey" FOREIGN KEY ("spreadsheetId") REFERENCES "Spreadsheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One active run per workspace. The service maps the violation to
-- ASSISTANT_BUSY (409). Terminal statuses: COMPLETED, FAILED, CANCELLED.
CREATE UNIQUE INDEX "AssistantRun_active_workspace_key" ON "AssistantRun"("workspaceId")
  WHERE "status" NOT IN ('COMPLETED', 'FAILED', 'CANCELLED');

-- Change feed: every insert/update publishes the row id on
-- `assistant_run_changed`. Only the id travels (NOTIFY payloads cap at 8000
-- bytes; `steps` and `transcript` can exceed it); the listener re-reads the
-- row. See modules/assistant/assistant.feed.ts and src/common/live-feed.ts.
CREATE OR REPLACE FUNCTION assistant_run_notify() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('assistant_run_changed', NEW."id");
  RETURN NEW;
END;
$$;

CREATE TRIGGER assistant_run_notify
AFTER INSERT OR UPDATE ON "AssistantRun"
FOR EACH ROW EXECUTE FUNCTION assistant_run_notify();
