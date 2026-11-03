-- CreateEnum
CREATE TYPE "UseCase" AS ENUM ('LEAD_RESEARCH', 'HIRING', 'EMAIL_OUTREACH', 'FORM_INTAKE', 'CUSTOMER_INSIGHTS', 'OTHER');

-- CreateEnum
CREATE TYPE "CompanyCrawlStatus" AS ENUM ('IDLE', 'SCRAPING', 'CRAWLING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "CompanyDocumentStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "useCases" "UseCase"[],
    "useCaseOther" TEXT,
    "website" TEXT,
    "name" TEXT,
    "iconUrl" TEXT,
    "summary" TEXT,
    "rules" TEXT,
    "crawlStatus" "CompanyCrawlStatus" NOT NULL DEFAULT 'IDLE',
    "crawlError" TEXT,
    "crawledAt" TIMESTAMP(3),
    "contextHash" TEXT,
    "geminiCacheName" TEXT,
    "geminiCacheHash" TEXT,
    "geminiCacheExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyPage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "markdown" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "status" "CompanyDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "digest" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_ownerId_key" ON "Company"("ownerId");

-- CreateIndex
CREATE INDEX "CompanyPage_companyId_idx" ON "CompanyPage"("companyId");

-- CreateIndex
CREATE INDEX "CompanyDocument_companyId_createdAt_idx" ON "CompanyDocument"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyPage" ADD CONSTRAINT "CompanyPage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyDocument" ADD CONSTRAINT "CompanyDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Change feed: every write to a company or one of its documents publishes the
-- company id on `company_changed`; the listener re-reads the whole profile.
-- See modules/company/company.feed.ts and src/common/live-feed.ts. An update
-- that leaves "updatedAt" alone is bookkeeping (contextHash, the Gemini cache
-- columns) and stays silent.
CREATE OR REPLACE FUNCTION company_notify() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."updatedAt" = OLD."updatedAt" THEN
    RETURN NEW;
  END IF;
  PERFORM pg_notify('company_changed', NEW."id");
  RETURN NEW;
END;
$$;

CREATE TRIGGER company_notify
AFTER INSERT OR UPDATE ON "Company"
FOR EACH ROW EXECUTE FUNCTION company_notify();

CREATE OR REPLACE FUNCTION company_document_notify() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM pg_notify('company_changed', OLD."companyId");
    RETURN OLD;
  END IF;
  PERFORM pg_notify('company_changed', NEW."companyId");
  RETURN NEW;
END;
$$;

CREATE TRIGGER company_document_notify
AFTER INSERT OR UPDATE OR DELETE ON "CompanyDocument"
FOR EACH ROW EXECUTE FUNCTION company_document_notify();
