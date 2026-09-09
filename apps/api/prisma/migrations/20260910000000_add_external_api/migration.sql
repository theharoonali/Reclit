-- CreateTable
CREATE TABLE "ExternalApi" (
    "id" TEXT NOT NULL,
    "cellId" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "output" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalApi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExternalApi_cellId_input_idx" ON "ExternalApi"("cellId", "input");

-- CreateIndex
CREATE INDEX "ExternalApi_cellId_createdAt_idx" ON "ExternalApi"("cellId", "createdAt");

-- AddForeignKey
ALTER TABLE "ExternalApi" ADD CONSTRAINT "ExternalApi_cellId_fkey" FOREIGN KEY ("cellId") REFERENCES "Cell"("id") ON DELETE CASCADE ON UPDATE CASCADE;
