-- CreateTable
CREATE TABLE "OfferFeedback" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "jobId" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "aspects" JSONB NOT NULL DEFAULT '[]',
    "tags" JSONB NOT NULL DEFAULT '[]',
    "note" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'web',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfferFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchedCompany" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "companyId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'user',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchedCompany_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfferFeedback_userId_verdict_idx" ON "OfferFeedback"("userId", "verdict");

-- CreateIndex
CREATE UNIQUE INDEX "OfferFeedback_userId_jobId_key" ON "OfferFeedback"("userId", "jobId");

-- CreateIndex
CREATE UNIQUE INDEX "WatchedCompany_userId_companyId_key" ON "WatchedCompany"("userId", "companyId");

-- AddForeignKey
ALTER TABLE "OfferFeedback" ADD CONSTRAINT "OfferFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferFeedback" ADD CONSTRAINT "OfferFeedback_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchedCompany" ADD CONSTRAINT "WatchedCompany_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchedCompany" ADD CONSTRAINT "WatchedCompany_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
