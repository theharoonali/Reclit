-- The backend-configured dashboard (docs/plans/029-backend-dashboard.md):
-- one Dashboard per workspace and its widgets. Configuration only — a
-- widget's "query" (filters, groupBy, series formulas) is computed in the
-- browser from the sheet, so no data lands here.

-- CreateEnum
CREATE TYPE "DashboardWidgetType" AS ENUM ('STAT', 'AREA', 'BAR', 'LINE', 'PIE', 'RADAR', 'RADIAL', 'HEATMAP', 'TABLE');

-- CreateEnum
CREATE TYPE "DashboardWidgetHeight" AS ENUM ('SM', 'MD', 'LG');

-- CreateTable
CREATE TABLE "Dashboard" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dashboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardWidget" (
    "id" TEXT NOT NULL,
    "dashboardId" TEXT NOT NULL,
    "spreadsheetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "DashboardWidgetType" NOT NULL,
    "variant" TEXT NOT NULL DEFAULT 'default',
    "row" INTEGER NOT NULL,
    "column" INTEGER NOT NULL,
    "sort" INTEGER NOT NULL,
    "height" "DashboardWidgetHeight" NOT NULL DEFAULT 'MD',
    "query" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardWidget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dashboard_workspaceId_key" ON "Dashboard"("workspaceId");

-- CreateIndex
CREATE INDEX "DashboardWidget_dashboardId_row_sort_idx" ON "DashboardWidget"("dashboardId", "row", "sort");

-- CreateIndex
CREATE INDEX "DashboardWidget_spreadsheetId_idx" ON "DashboardWidget"("spreadsheetId");

-- AddForeignKey
ALTER TABLE "Dashboard" ADD CONSTRAINT "Dashboard_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardWidget" ADD CONSTRAINT "DashboardWidget_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "Dashboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardWidget" ADD CONSTRAINT "DashboardWidget_spreadsheetId_fkey" FOREIGN KEY ("spreadsheetId") REFERENCES "Spreadsheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
