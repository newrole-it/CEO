-- The company brief: the latest one per person and company, with the sources of every statement
-- in "result" (src/server/research/service.ts). Additive: one new table.
CREATE TABLE "CompanyBrief" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT,
    "result" JSONB NOT NULL,
    "locale" TEXT NOT NULL,
    "webState" TEXT NOT NULL,
    "offerHash" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyBrief_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyBrief_companyId_idx" ON "CompanyBrief"("companyId");

-- CreateIndex
CREATE INDEX "CompanyBrief_jobId_idx" ON "CompanyBrief"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyBrief_userId_companyId_key" ON "CompanyBrief"("userId", "companyId");

-- AddForeignKey
ALTER TABLE "CompanyBrief" ADD CONSTRAINT "CompanyBrief_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyBrief" ADD CONSTRAINT "CompanyBrief_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyBrief" ADD CONSTRAINT "CompanyBrief_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
