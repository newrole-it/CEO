-- AlterTable
ALTER TABLE "CvDocument" ADD COLUMN     "baseCvId" TEXT,
ADD COLUMN     "docType" TEXT NOT NULL DEFAULT 'CV',
ADD COLUMN     "jobId" TEXT,
ADD COLUMN     "tailorNotes" JSONB,
ADD COLUMN     "targetCompany" TEXT,
ADD COLUMN     "targetTitle" TEXT,
ADD COLUMN     "versionCheckedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CvVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "origin" TEXT NOT NULL,
    "label" TEXT,
    "sourceNumber" INTEGER,
    "language" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CvVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CvVersion_documentId_number_key" ON "CvVersion"("documentId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "CvDocument_userId_jobId_docType_key" ON "CvDocument"("userId", "jobId", "docType");

-- AddForeignKey
ALTER TABLE "CvDocument" ADD CONSTRAINT "CvDocument_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CvDocument" ADD CONSTRAINT "CvDocument_baseCvId_fkey" FOREIGN KEY ("baseCvId") REFERENCES "CvDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CvVersion" ADD CONSTRAINT "CvVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "CvDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
