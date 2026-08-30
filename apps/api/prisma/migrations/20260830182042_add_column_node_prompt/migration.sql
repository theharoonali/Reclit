-- CreateEnum
CREATE TYPE "NodeType" AS ENUM ('AI', 'EMAIL');

-- AlterTable
ALTER TABLE "Column" ADD COLUMN     "node" "NodeType",
ADD COLUMN     "prompt" TEXT;
