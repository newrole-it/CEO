-- "Is it worth applying": the latest evaluation of one offer for one person, with what it was
-- made against (the CV, the offer's text, the profile), so the page can tell when it is out of date.
CREATE TABLE "OfferEvaluation" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "jobId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "score" INTEGER,
    "result" JSONB NOT NULL,
    "locale" TEXT NOT NULL,
    "usedModel" BOOLEAN NOT NULL DEFAULT false,
    "cvId" TEXT,
    "cvHash" TEXT,
    "offerHash" TEXT NOT NULL,
    "offerOrigin" TEXT NOT NULL,
    "profileHash" TEXT NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfferEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfferEvaluation_jobId_idx" ON "OfferEvaluation"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "OfferEvaluation_userId_jobId_key" ON "OfferEvaluation"("userId", "jobId");

-- AddForeignKey
ALTER TABLE "OfferEvaluation" ADD CONSTRAINT "OfferEvaluation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferEvaluation" ADD CONSTRAINT "OfferEvaluation_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
