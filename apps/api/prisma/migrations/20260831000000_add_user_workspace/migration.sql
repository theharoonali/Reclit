-- Create "User" and "Workspace", and give every "Spreadsheet" a required
-- "workspaceId" (docs/plans/013-workspaces.md).
--
-- Backfill: one default user (only if none exists), then one workspace per
-- existing spreadsheet, named after the sheet and reusing the sheet's uuid as
-- the workspace id — deterministic, no join table needed.

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Workspace_ownerId_idx" ON "Workspace"("ownerId");

-- CreateIndex
CREATE INDEX "Workspace_createdAt_idx" ON "Workspace"("createdAt");

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable (nullable first; SET NOT NULL after the backfill)
ALTER TABLE "Spreadsheet" ADD COLUMN "workspaceId" TEXT;

-- Backfill: default user, only when the table is empty.
INSERT INTO "User" ("id", "name", "updatedAt")
SELECT gen_random_uuid(), 'Demo User', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "User");

-- Backfill: one workspace per existing spreadsheet, owned by the first user.
INSERT INTO "Workspace" ("id", "name", "ownerId", "createdAt", "updatedAt")
SELECT s."id",
       s."name",
       (SELECT u."id" FROM "User" u ORDER BY u."createdAt" ASC LIMIT 1),
       s."createdAt",
       CURRENT_TIMESTAMP
FROM "Spreadsheet" s;

UPDATE "Spreadsheet" SET "workspaceId" = "id";

-- Lock it down.
ALTER TABLE "Spreadsheet" ALTER COLUMN "workspaceId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Spreadsheet" ADD CONSTRAINT "Spreadsheet_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Spreadsheet_workspaceId_idx" ON "Spreadsheet"("workspaceId");
