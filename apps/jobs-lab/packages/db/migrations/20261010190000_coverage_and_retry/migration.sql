-- AlterEnum
ALTER TYPE "SearchRunStatus" ADD VALUE 'RETRYING';
ALTER TYPE "SourceType" ADD VALUE 'SUCCESSFACTORS';
ALTER TYPE "SourceType" ADD VALUE 'WORKDAY';
ALTER TYPE "SourceType" ADD VALUE 'ICIMS';
ALTER TYPE "SourceType" ADD VALUE 'PHENOM';
ALTER TYPE "SourceType" ADD VALUE 'AVATURE';
ALTER TYPE "SourceType" ADD VALUE 'ERECRUITER';
ALTER TYPE "SourceType" ADD VALUE 'JOBVITE';

-- AlterTable
ALTER TABLE "Job" ADD COLUMN "variants" JSONB;
ALTER TABLE "Job" ADD COLUMN "llmOptOut" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CareerPage" ADD COLUMN "fetchNote" TEXT;

CREATE TABLE "CrawlBudget" (
  "host" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "detailFetches" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrawlBudget_pkey" PRIMARY KEY ("host")
);

-- Company names are the dedupe key. The non-unique index is replaced by a unique one.
DROP INDEX IF EXISTS "Company_normalizedName_idx";
CREATE UNIQUE INDEX "Company_normalizedName_key" ON "Company"("normalizedName");
