-- AlterTable
ALTER TABLE "CatalogBoard" ADD COLUMN     "nextCheckAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "CatalogBoard_nextCheckAt_idx" ON "CatalogBoard"("nextCheckAt");

