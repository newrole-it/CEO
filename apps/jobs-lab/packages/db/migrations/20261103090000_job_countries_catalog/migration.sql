-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "countrySource" TEXT,
ADD COLUMN     "remoteRegions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "CatalogBoard" (
    "id" TEXT NOT NULL,
    "provider" "SourceType" NOT NULL,
    "providerBoardId" TEXT NOT NULL,
    "listedName" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'candidate',
    "reason" TEXT,
    "note" TEXT,
    "companyName" TEXT,
    "listedJobs" INTEGER NOT NULL DEFAULT 0,
    "itJobs" INTEGER NOT NULL DEFAULT 0,
    "countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "checkedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "checks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogBoard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CatalogBoard_status_checkedAt_idx" ON "CatalogBoard"("status", "checkedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogBoard_provider_providerBoardId_key" ON "CatalogBoard"("provider", "providerBoardId");

-- CreateIndex
CREATE INDEX "Job_countries_idx" ON "Job" USING GIN ("countries");

