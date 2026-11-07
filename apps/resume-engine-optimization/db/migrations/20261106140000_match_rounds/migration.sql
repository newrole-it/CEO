-- What the person says about themselves on a point of a match, kept as their data.
CREATE TABLE "CandidateFact" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "topic" TEXT,
    "jobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateFact_pkey" PRIMARY KEY ("id")
);

-- Each round of the match of a CV written for an offer, with the person's comments on it.
CREATE TABLE "MatchRound" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "documentId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "notes" JSONB NOT NULL,
    "score" INTEGER,
    "atsScore" INTEGER,
    "comments" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchRound_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CandidateFact_userId_createdAt_idx" ON "CandidateFact"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MatchRound_userId_createdAt_idx" ON "MatchRound"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MatchRound_documentId_number_key" ON "MatchRound"("documentId", "number");

-- AddForeignKey
ALTER TABLE "CandidateFact" ADD CONSTRAINT "CandidateFact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateFact" ADD CONSTRAINT "CandidateFact_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchRound" ADD CONSTRAINT "MatchRound_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchRound" ADD CONSTRAINT "MatchRound_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "CvDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
