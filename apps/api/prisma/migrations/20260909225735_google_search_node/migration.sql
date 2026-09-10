-- AlterEnum
ALTER TYPE "NodeType" ADD VALUE 'GOOGLE_SEARCH';

-- AlterTable
ALTER TABLE "Column" ADD COLUMN     "config" JSONB;
