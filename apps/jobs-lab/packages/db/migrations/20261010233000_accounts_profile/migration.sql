ALTER TABLE "User" ADD COLUMN "linkedinSub" TEXT;
ALTER TABLE "User" ADD COLUMN "imageUrl" TEXT;
CREATE UNIQUE INDEX "User_linkedinSub_key" ON "User"("linkedinSub");

CREATE TABLE "LoginLink" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "hashedToken" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "requestIp" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoginLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LoginLink_hashedToken_key" ON "LoginLink"("hashedToken");
CREATE INDEX "LoginLink_email_createdAt_idx" ON "LoginLink"("email", "createdAt");

CREATE TABLE "AuthRateLimit" (
  "key" TEXT NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "AuthRateLimit_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "CandidateProfile" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "headline" TEXT,
  "currentTitle" TEXT,
  "pastTitles" JSONB NOT NULL DEFAULT '[]',
  "seniority" TEXT,
  "yearsExperience" DOUBLE PRECISION,
  "skills" JSONB NOT NULL DEFAULT '[]',
  "industries" JSONB NOT NULL DEFAULT '[]',
  "locations" JSONB NOT NULL DEFAULT '[]',
  "languages" JSONB NOT NULL DEFAULT '[]',
  "salaryFloor" DOUBLE PRECISION,
  "salaryTarget" DOUBLE PRECISION,
  "salaryCurrency" TEXT,
  "salaryPeriod" TEXT,
  "salaryContract" TEXT,
  "industryMode" TEXT NOT NULL DEFAULT 'prefer',
  "contracts" JSONB NOT NULL DEFAULT '[]',
  "remotePreference" TEXT,
  "homeCity" TEXT,
  "relocation" BOOLEAN,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CandidateProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CandidateProfile_userId_key" ON "CandidateProfile"("userId");
ALTER TABLE "CandidateProfile" ADD CONSTRAINT "CandidateProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JobMatch" ADD COLUMN "interestedAt" TIMESTAMP(3);
ALTER TABLE "JobMatch" ADD COLUMN "fitIndustry" TEXT;
ALTER TABLE "JobMatch" ADD COLUMN "fitSalaryMonthly" DOUBLE PRECISION;
