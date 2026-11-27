-- Searches for offers and the links they found, with how each was read and evaluated
-- (src/server/offer-search). Additive: two new tables.
CREATE TABLE "OfferSearch" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "filters" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "errorCode" TEXT,
    "counts" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "OfferSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferSearchResult" (
    "id" TEXT NOT NULL,
    "searchId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "jobId" TEXT,
    "url" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "reason" TEXT,
    "factsByModel" BOOLEAN NOT NULL DEFAULT false,
    "decision" TEXT,
    "score" INTEGER,
    "evaluation" JSONB,
    "rank" INTEGER,
    "dismissedAt" TIMESTAMP(3),
    "addedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferSearchResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfferSearch_userId_createdAt_idx" ON "OfferSearch"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "OfferSearchResult_userId_dismissedAt_idx" ON "OfferSearchResult"("userId", "dismissedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OfferSearchResult_searchId_url_key" ON "OfferSearchResult"("searchId", "url");

-- AddForeignKey
ALTER TABLE "OfferSearch" ADD CONSTRAINT "OfferSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferSearchResult" ADD CONSTRAINT "OfferSearchResult_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "OfferSearch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferSearchResult" ADD CONSTRAINT "OfferSearchResult_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
