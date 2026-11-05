ALTER TABLE "CandidateProfile" ADD COLUMN "linkedinDocument" JSONB;
ALTER TABLE "CandidateProfile" ADD COLUMN "linkedinImportedAt" TIMESTAMP(3);

CREATE TABLE "ProfileAuditRun" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "previousScore" INTEGER,
    "summary" TEXT NOT NULL,
    "topChanges" JSONB NOT NULL,
    "annotations" JSONB NOT NULL,
    "demand" JSONB NOT NULL,
    "documentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileAuditRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProfileAuditRun_userId_createdAt_idx" ON "ProfileAuditRun"("userId", "createdAt");

ALTER TABLE "ProfileAuditRun" ADD CONSTRAINT "ProfileAuditRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
