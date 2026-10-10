-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('GREENHOUSE', 'LEVER', 'ASHBY', 'WORKABLE', 'SMARTRECRUITERS', 'GENERIC_HTML', 'WEB_SEARCH');

-- CreateEnum
CREATE TYPE "ResolutionStatus" AS ENUM ('PENDING', 'RESOLVED_ATS', 'RESOLVED_GENERIC', 'NO_CAREER_PAGE_FOUND', 'TEMPORARY_FAILURE', 'BLOCKED_OR_NOT_PERMITTED', 'MANUAL_REVIEW', 'PERMANENTLY_UNAVAILABLE');

-- CreateEnum
CREATE TYPE "WorkplaceType" AS ENUM ('REMOTE', 'HYBRID', 'ONSITE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('ACTIVE', 'POSSIBLY_CLOSED', 'CLOSED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "FetchStatus" AS ENUM ('HEALTHY', 'TEMPORARY_ERROR', 'RATE_LIMITED', 'NOT_FOUND', 'NOT_PERMITTED', 'PARSE_ERROR');

-- CreateEnum
CREATE TYPE "SearchRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "hashedPassword" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "emailVerifiedAt" TIMESTAMP(3),
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Warsaw',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "handle" TEXT NOT NULL,
    "hashedSessionToken" TEXT,
    "antiCSRFToken" TEXT,
    "publicData" TEXT,
    "privateData" TEXT,
    "userId" INTEGER,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Token" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "hashedToken" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentTo" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "Token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "canonicalDomain" TEXT,
    "description" TEXT,
    "industry" TEXT,
    "headquartersCountry" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastEnrichedAt" TIMESTAMP(3),

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyAlias" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "normalizedAlias" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "CompanyAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoverySource" (
    "id" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "termsUrl" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "rateLimitConfig" JSONB,
    "lastRunAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscoverySource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoveryRun" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "searchRunId" TEXT,
    "query" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "resultsCount" INTEGER NOT NULL DEFAULT 0,
    "newCompaniesCount" INTEGER NOT NULL DEFAULT 0,
    "newCareerPagesCount" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorSummary" TEXT,
    "estimatedCost" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "DiscoveryRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerPage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "normalizedUrl" TEXT NOT NULL,
    "provider" "SourceType" NOT NULL,
    "providerBoardId" TEXT,
    "resolutionStatus" "ResolutionStatus" NOT NULL DEFAULT 'RESOLVED_ATS',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastCheckedAt" TIMESTAMP(3),
    "lastSuccessfulFetchAt" TIMESTAMP(3),
    "nextCheckAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareerPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "careerPageId" TEXT,
    "externalId" TEXT,
    "sourceType" "SourceType" NOT NULL,
    "sourceBoardId" TEXT,
    "title" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "descriptionText" TEXT NOT NULL,
    "locationText" TEXT,
    "normalizedLocation" TEXT,
    "countryCode" TEXT,
    "workplaceType" "WorkplaceType" NOT NULL DEFAULT 'UNKNOWN',
    "employmentType" TEXT,
    "salaryMin" DOUBLE PRECISION,
    "salaryMax" DOUBLE PRECISION,
    "salaryCurrency" TEXT,
    "originalUrl" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVerifiedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "status" "JobStatus" NOT NULL DEFAULT 'ACTIVE',
    "contentHash" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobObservation" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "careerPageId" TEXT,
    "searchRunId" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contentHash" TEXT NOT NULL,
    "fetchStatus" "FetchStatus" NOT NULL,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedSearch" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "phrase" TEXT NOT NULL,
    "locationHint" TEXT,
    "workMode" TEXT NOT NULL DEFAULT 'ANY',
    "targetTitles" JSONB NOT NULL,
    "includedKeywords" JSONB NOT NULL,
    "excludedKeywords" JSONB NOT NULL,
    "seniority" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchRun" (
    "id" TEXT NOT NULL,
    "savedSearchId" TEXT NOT NULL,
    "status" "SearchRunStatus" NOT NULL DEFAULT 'QUEUED',
    "phase" TEXT NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "expansion" JSONB,
    "stats" JSONB,
    "tokenInput" INTEGER NOT NULL DEFAULT 0,
    "tokenOutput" INTEGER NOT NULL DEFAULT 0,
    "estimatedCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "errorSummary" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "discoveredBoards" INTEGER NOT NULL DEFAULT 0,
    "fetchedJobs" INTEGER NOT NULL DEFAULT 0,
    "matchedJobs" INTEGER NOT NULL DEFAULT 0,
    "newJobs" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SearchRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchLog" (
    "id" TEXT NOT NULL,
    "searchRunId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,

    CONSTRAINT "SearchLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobMatch" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "savedSearchId" TEXT NOT NULL,
    "searchRunId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "scoreBreakdown" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "isNew" BOOLEAN NOT NULL DEFAULT false,
    "matchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEvaluatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LlmCache" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "tokenInput" INTEGER NOT NULL DEFAULT 0,
    "tokenOutput" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackgroundTask" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "BackgroundTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "userId" INTEGER,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_handle_key" ON "Session"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "Token_hashedToken_type_key" ON "Token"("hashedToken", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Company_canonicalDomain_key" ON "Company"("canonicalDomain");

-- CreateIndex
CREATE INDEX "Company_normalizedName_idx" ON "Company"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyAlias_companyId_normalizedAlias_key" ON "CompanyAlias"("companyId", "normalizedAlias");

-- CreateIndex
CREATE UNIQUE INDEX "DiscoverySource_sourceName_key" ON "DiscoverySource"("sourceName");

-- CreateIndex
CREATE INDEX "CareerPage_normalizedUrl_idx" ON "CareerPage"("normalizedUrl");

-- CreateIndex
CREATE UNIQUE INDEX "CareerPage_provider_providerBoardId_key" ON "CareerPage"("provider", "providerBoardId");

-- CreateIndex
CREATE UNIQUE INDEX "Job_identityKey_key" ON "Job"("identityKey");

-- CreateIndex
CREATE INDEX "Job_fingerprint_idx" ON "Job"("fingerprint");

-- CreateIndex
CREATE INDEX "Job_canonicalUrl_idx" ON "Job"("canonicalUrl");

-- CreateIndex
CREATE INDEX "Job_companyId_idx" ON "Job"("companyId");

-- CreateIndex
CREATE INDEX "JobObservation_jobId_idx" ON "JobObservation"("jobId");

-- CreateIndex
CREATE INDEX "JobObservation_searchRunId_idx" ON "JobObservation"("searchRunId");

-- CreateIndex
CREATE INDEX "SavedSearch_userId_createdAt_idx" ON "SavedSearch"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SearchRun_savedSearchId_startedAt_idx" ON "SearchRun"("savedSearchId", "startedAt");

-- CreateIndex
CREATE INDEX "SearchLog_searchRunId_createdAt_idx" ON "SearchLog"("searchRunId", "createdAt");

-- CreateIndex
CREATE INDEX "JobMatch_savedSearchId_idx" ON "JobMatch"("savedSearchId");

-- CreateIndex
CREATE INDEX "JobMatch_searchRunId_score_idx" ON "JobMatch"("searchRunId", "score");

-- CreateIndex
CREATE UNIQUE INDEX "JobMatch_jobId_searchRunId_key" ON "JobMatch"("jobId", "searchRunId");

-- CreateIndex
CREATE UNIQUE INDEX "LlmCache_cacheKey_key" ON "LlmCache"("cacheKey");

-- CreateIndex
CREATE INDEX "BackgroundTask_status_runAt_idx" ON "BackgroundTask"("status", "runAt");

-- CreateIndex
CREATE INDEX "AuditEvent_userId_createdAt_idx" ON "AuditEvent"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Token" ADD CONSTRAINT "Token_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAlias" ADD CONSTRAINT "CompanyAlias_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryRun" ADD CONSTRAINT "DiscoveryRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DiscoverySource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryRun" ADD CONSTRAINT "DiscoveryRun_searchRunId_fkey" FOREIGN KEY ("searchRunId") REFERENCES "SearchRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerPage" ADD CONSTRAINT "CareerPage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_careerPageId_fkey" FOREIGN KEY ("careerPageId") REFERENCES "CareerPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobObservation" ADD CONSTRAINT "JobObservation_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobObservation" ADD CONSTRAINT "JobObservation_careerPageId_fkey" FOREIGN KEY ("careerPageId") REFERENCES "CareerPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobObservation" ADD CONSTRAINT "JobObservation_searchRunId_fkey" FOREIGN KEY ("searchRunId") REFERENCES "SearchRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedSearch" ADD CONSTRAINT "SavedSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchRun" ADD CONSTRAINT "SearchRun_savedSearchId_fkey" FOREIGN KEY ("savedSearchId") REFERENCES "SavedSearch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchLog" ADD CONSTRAINT "SearchLog_searchRunId_fkey" FOREIGN KEY ("searchRunId") REFERENCES "SearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobMatch" ADD CONSTRAINT "JobMatch_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobMatch" ADD CONSTRAINT "JobMatch_savedSearchId_fkey" FOREIGN KEY ("savedSearchId") REFERENCES "SavedSearch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobMatch" ADD CONSTRAINT "JobMatch_searchRunId_fkey" FOREIGN KEY ("searchRunId") REFERENCES "SearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
