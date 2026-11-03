-- docs/plans/044-table-consolidation.md: 15 tables → 10.
--   A. RunAi + AssistantRun + DashboardGeneration → AiRun (kind CELL | ASSISTANT | DASHBOARD)
--   B. Dashboard → Workspace columns; DashboardWidget.dashboardId → workspaceId
--   C. Company → User columns; CompanyPage dropped (pageCount); CompanyDocument.companyId → userId
-- Every row is copied before anything is dropped. Postgres runs this
-- multi-statement script as one implicit transaction, so a failure leaves the
-- old schema intact.

-- ─── A. AiRun ────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "AiRunKind" AS ENUM ('CELL', 'ASSISTANT', 'DASHBOARD');

-- CreateEnum
CREATE TYPE "AiRunSource" AS ENUM ('USER', 'SYSTEM', 'ONBOARDING', 'DASHBOARD');

-- CreateTable
CREATE TABLE "AiRun" (
    "id" TEXT NOT NULL,
    "kind" "AiRunKind" NOT NULL,
    "workspaceId" TEXT,
    "spreadsheetId" TEXT,
    "cellId" TEXT,
    "batchId" TEXT,
    "awaitBatchId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "source" "AiRunSource",
    "scope" "AssistantScope",
    "prompt" TEXT,
    "phase" TEXT,
    "attempt" INTEGER,
    "steps" JSONB,
    "pendingAction" JSONB,
    "summary" TEXT,
    "brief" JSONB,
    "result" JSONB,
    "error" JSONB,
    "model" TEXT,
    "usage" JSONB,
    "transcript" JSONB,
    "triggerRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiRun_pkey" PRIMARY KEY ("id"),
    -- Each kind's required columns; the services' mappers rely on these.
    CONSTRAINT "AiRun_kind_columns_check" CHECK (
      ("kind" = 'CELL'
        AND "cellId" IS NOT NULL AND "spreadsheetId" IS NOT NULL AND "batchId" IS NOT NULL)
      OR ("kind" = 'ASSISTANT'
        AND "workspaceId" IS NOT NULL AND "scope" IS NOT NULL AND "source" IS NOT NULL
        AND "prompt" IS NOT NULL AND "steps" IS NOT NULL)
      OR ("kind" = 'DASHBOARD'
        AND "workspaceId" IS NOT NULL AND "spreadsheetId" IS NOT NULL AND "source" IS NOT NULL
        AND "phase" IS NOT NULL AND "attempt" IS NOT NULL AND "steps" IS NOT NULL)
    )
);

-- Copy the three run tables, ids kept (in-flight runs and feed event ids survive).
INSERT INTO "AiRun" ("id", "kind", "cellId", "spreadsheetId", "batchId", "status", "result", "createdAt", "updatedAt")
SELECT "id", 'CELL', "cellId", "spreadsheetId", "batchId", "status", "result", "createdAt", "updatedAt"
FROM "RunAi";

INSERT INTO "AiRun" ("id", "kind", "workspaceId", "spreadsheetId", "scope", "source", "prompt", "status", "steps",
                     "pendingAction", "summary", "error", "model", "usage", "transcript", "triggerRunId", "createdAt", "updatedAt")
SELECT "id", 'ASSISTANT', "workspaceId", "spreadsheetId", "scope", "source"::text::"AiRunSource", "prompt", "status", "steps",
       "pendingAction", "summary", "error", "model", "usage", "transcript", "triggerRunId", "createdAt", "updatedAt"
FROM "AssistantRun";

INSERT INTO "AiRun" ("id", "kind", "workspaceId", "spreadsheetId", "source", "status", "phase", "attempt", "awaitBatchId",
                     "steps", "brief", "result", "error", "model", "usage", "triggerRunId", "createdAt", "updatedAt")
SELECT "id", 'DASHBOARD', "workspaceId", "spreadsheetId", "source"::text::"AiRunSource", "status", "phase", "attempt", "awaitBatchId",
       "log", "brief", "result", "error", "model", "usage", "triggerRunId", "createdAt", "updatedAt"
FROM "DashboardGeneration";

-- CreateIndex
CREATE INDEX "AiRun_kind_spreadsheetId_updatedAt_idx" ON "AiRun"("kind", "spreadsheetId", "updatedAt");

-- CreateIndex
CREATE INDEX "AiRun_kind_workspaceId_updatedAt_idx" ON "AiRun"("kind", "workspaceId", "updatedAt");

-- CreateIndex
CREATE INDEX "AiRun_cellId_idx" ON "AiRun"("cellId");

-- CreateIndex
CREATE INDEX "AiRun_batchId_idx" ON "AiRun"("batchId");

-- CreateIndex
CREATE INDEX "AiRun_createdAt_idx" ON "AiRun"("createdAt");

-- AddForeignKey
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One working run per cell. The service maps the violation to RUN_AI_CELL_BUSY.
CREATE UNIQUE INDEX "AiRun_active_cell_key" ON "AiRun"("cellId")
  WHERE "kind" = 'CELL' AND "status" NOT IN ('COMPLETED', 'FAILED');

-- One active assistant run per workspace (ASSISTANT_BUSY).
CREATE UNIQUE INDEX "AiRun_active_assistant_key" ON "AiRun"("workspaceId")
  WHERE "kind" = 'ASSISTANT' AND "status" NOT IN ('COMPLETED', 'FAILED', 'CANCELLED');

-- One active dashboard generation per workspace (DASHBOARD_GENERATION_BUSY).
CREATE UNIQUE INDEX "AiRun_active_dashboard_key" ON "AiRun"("workspaceId")
  WHERE "kind" = 'DASHBOARD' AND "status" NOT IN ('COMPLETED', 'FAILED', 'CANCELLED');

-- Change feed: every insert/update publishes the row id on its kind's channel —
-- the same three channels as before, so each feature's LiveFeed listener is
-- unchanged. Only the id travels (NOTIFY payloads cap at 8000 bytes); the
-- listener re-reads the row. See src/common/live-feed.ts.
CREATE OR REPLACE FUNCTION ai_run_notify() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify(
    CASE NEW."kind"
      WHEN 'CELL' THEN 'run_ai_changed'
      WHEN 'ASSISTANT' THEN 'assistant_run_changed'
      ELSE 'dashboard_generation_changed'
    END,
    NEW."id"
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER ai_run_notify
AFTER INSERT OR UPDATE ON "AiRun"
FOR EACH ROW EXECUTE FUNCTION ai_run_notify();

-- A sheet takes its assistant and dashboard runs with it (the old foreign
-- keys did this). Cell runs are kept: they outlive their cells and sheets.
CREATE OR REPLACE FUNCTION ai_run_spreadsheet_cascade() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM "AiRun" WHERE "spreadsheetId" = OLD."id" AND "kind" <> 'CELL';
  RETURN OLD;
END;
$$;

CREATE TRIGGER ai_run_spreadsheet_cascade
AFTER DELETE ON "Spreadsheet"
FOR EACH ROW EXECUTE FUNCTION ai_run_spreadsheet_cascade();

-- DropTable (their triggers go with them)
DROP TABLE "RunAi";
DROP TABLE "AssistantRun";
DROP TABLE "DashboardGeneration";

DROP FUNCTION IF EXISTS run_ai_notify();
DROP FUNCTION IF EXISTS assistant_run_notify();
DROP FUNCTION IF EXISTS dashboard_generation_notify();

-- DropEnum
DROP TYPE "AssistantSource";
DROP TYPE "DashboardGenerationSource";

-- ─── B. Dashboard → Workspace ────────────────────────────────────────────────

-- AlterTable
ALTER TABLE "Workspace"
  ADD COLUMN "dashboardCreatedAt" TIMESTAMP(3),
  ADD COLUMN "dashboardTitle" TEXT,
  ADD COLUMN "dashboardDescription" TEXT;

UPDATE "Workspace" w
SET "dashboardCreatedAt" = d."createdAt",
    "dashboardTitle" = d."title",
    "dashboardDescription" = d."description"
FROM "Dashboard" d
WHERE d."workspaceId" = w."id";

-- AlterTable
ALTER TABLE "DashboardWidget" ADD COLUMN "workspaceId" TEXT;

UPDATE "DashboardWidget" dw
SET "workspaceId" = d."workspaceId"
FROM "Dashboard" d
WHERE d."id" = dw."dashboardId";

ALTER TABLE "DashboardWidget" ALTER COLUMN "workspaceId" SET NOT NULL;

-- DropForeignKey
ALTER TABLE "DashboardWidget" DROP CONSTRAINT "DashboardWidget_dashboardId_fkey";

-- DropIndex
DROP INDEX "DashboardWidget_dashboardId_row_sort_idx";

-- AlterTable
ALTER TABLE "DashboardWidget" DROP COLUMN "dashboardId";

-- CreateIndex
CREATE INDEX "DashboardWidget_workspaceId_row_sort_idx" ON "DashboardWidget"("workspaceId", "row", "sort");

-- AddForeignKey
ALTER TABLE "DashboardWidget" ADD CONSTRAINT "DashboardWidget_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropTable
DROP TABLE "Dashboard";

-- ─── C. Company → User ───────────────────────────────────────────────────────

-- AlterTable
ALTER TABLE "User"
  ADD COLUMN "useCases" "UseCase"[] DEFAULT ARRAY[]::"UseCase"[],
  ADD COLUMN "useCaseOther" TEXT,
  ADD COLUMN "companyWebsite" TEXT,
  ADD COLUMN "companyName" TEXT,
  ADD COLUMN "companyIconUrl" TEXT,
  ADD COLUMN "companySummary" TEXT,
  ADD COLUMN "companyRules" TEXT,
  ADD COLUMN "crawlStatus" "CompanyCrawlStatus" NOT NULL DEFAULT 'IDLE',
  ADD COLUMN "crawlError" TEXT,
  ADD COLUMN "crawledAt" TIMESTAMP(3),
  ADD COLUMN "pageCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "contextHash" TEXT,
  ADD COLUMN "promptCacheName" TEXT,
  ADD COLUMN "promptCacheHash" TEXT,
  ADD COLUMN "promptCacheExpiresAt" TIMESTAMP(3),
  ADD COLUMN "companyUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "User" u
SET "useCases" = c."useCases",
    "useCaseOther" = c."useCaseOther",
    "companyWebsite" = c."website",
    "companyName" = c."name",
    "companyIconUrl" = c."iconUrl",
    "companySummary" = c."summary",
    "companyRules" = c."rules",
    "crawlStatus" = c."crawlStatus",
    "crawlError" = c."crawlError",
    "crawledAt" = c."crawledAt",
    "pageCount" = (SELECT count(*)::int FROM "CompanyPage" p WHERE p."companyId" = c."id"),
    "contextHash" = c."contextHash",
    "promptCacheName" = c."geminiCacheName",
    "promptCacheHash" = c."geminiCacheHash",
    "promptCacheExpiresAt" = c."geminiCacheExpiresAt",
    "companyUpdatedAt" = c."updatedAt"
FROM "Company" c
WHERE c."ownerId" = u."id";

-- AlterTable
ALTER TABLE "CompanyDocument" ADD COLUMN "userId" TEXT;

UPDATE "CompanyDocument" cd
SET "userId" = c."ownerId"
FROM "Company" c
WHERE c."id" = cd."companyId";

ALTER TABLE "CompanyDocument" ALTER COLUMN "userId" SET NOT NULL;

-- DropTrigger (its function is redefined below for the new column)
DROP TRIGGER company_document_notify ON "CompanyDocument";

-- DropForeignKey
ALTER TABLE "CompanyDocument" DROP CONSTRAINT "CompanyDocument_companyId_fkey";

-- DropIndex
DROP INDEX "CompanyDocument_companyId_createdAt_idx";

-- AlterTable
ALTER TABLE "CompanyDocument" DROP COLUMN "companyId";

-- CreateIndex
CREATE INDEX "CompanyDocument_userId_createdAt_idx" ON "CompanyDocument"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "CompanyDocument" ADD CONSTRAINT "CompanyDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropTable (company_notify goes with Company)
DROP TABLE "CompanyPage";
DROP TABLE "Company";

DROP FUNCTION IF EXISTS company_notify();

-- Change feed: a company-profile write publishes the user id on
-- `company_changed`; the listener re-reads the whole profile. Only a moved
-- "companyUpdatedAt" counts — user.update, the onboarding flag and the
-- context / prompt-cache bookkeeping stay silent. See
-- modules/company/company.feed.ts and src/common/live-feed.ts.
CREATE OR REPLACE FUNCTION user_company_notify() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."companyUpdatedAt" IS NOT DISTINCT FROM OLD."companyUpdatedAt" THEN
    RETURN NEW;
  END IF;
  PERFORM pg_notify('company_changed', NEW."id");
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_company_notify
AFTER UPDATE ON "User"
FOR EACH ROW EXECUTE FUNCTION user_company_notify();

CREATE OR REPLACE FUNCTION company_document_notify() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM pg_notify('company_changed', OLD."userId");
    RETURN OLD;
  END IF;
  PERFORM pg_notify('company_changed', NEW."userId");
  RETURN NEW;
END;
$$;

CREATE TRIGGER company_document_notify
AFTER INSERT OR UPDATE OR DELETE ON "CompanyDocument"
FOR EACH ROW EXECUTE FUNCTION company_document_notify();
