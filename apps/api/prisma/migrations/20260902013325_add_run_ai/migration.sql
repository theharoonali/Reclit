-- CreateEnum
CREATE TYPE "RunAiStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "RunAi" (
    "id" TEXT NOT NULL,
    "cellId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "status" "RunAiStatus" NOT NULL DEFAULT 'PENDING',
    "credit" INTEGER NOT NULL DEFAULT 0,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RunAi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RunAi_cellId_idx" ON "RunAi"("cellId");

-- CreateIndex
CREATE INDEX "RunAi_batchId_idx" ON "RunAi"("batchId");

-- CreateIndex
CREATE INDEX "RunAi_createdAt_idx" ON "RunAi"("createdAt");
