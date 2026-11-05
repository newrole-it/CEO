-- AlterTable
ALTER TABLE "User" ADD COLUMN     "applicant" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "jobId" TEXT,
    "company" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "urlKey" TEXT,
    "location" TEXT,
    "salaryText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'APPLIED',
    "stageNote" TEXT,
    "closedAtStage" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextStep" TEXT,
    "nextStepAt" TIMESTAMP(3),
    "contact" TEXT,
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "cvDocumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationEvent" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "note" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'web',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CvDocument" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'pl',
    "kind" TEXT NOT NULL DEFAULT 'EDITABLE',
    "content" JSONB,
    "pdf" BYTEA,
    "pdfName" TEXT,
    "pdfUpdatedAt" TIMESTAMP(3),
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CvDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Answer" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "questionKey" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "language" TEXT,
    "company" TEXT,
    "jobTitle" TEXT,
    "sourceUrl" TEXT,
    "applicationId" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'manual',
    "useCount" INTEGER NOT NULL DEFAULT 1,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiToken" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "hashedToken" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SheetLink" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "webhookUrl" TEXT,
    "secret" TEXT NOT NULL,
    "spreadsheetUrl" TEXT,
    "autoSync" BOOLEAN NOT NULL DEFAULT true,
    "includeNotes" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastRowCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SheetLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Application_userId_status_idx" ON "Application"("userId", "status");

-- CreateIndex
CREATE INDEX "Application_userId_urlKey_idx" ON "Application"("userId", "urlKey");

-- CreateIndex
CREATE INDEX "Application_userId_jobId_idx" ON "Application"("userId", "jobId");

-- CreateIndex
CREATE INDEX "ApplicationEvent_applicationId_at_idx" ON "ApplicationEvent"("applicationId", "at");

-- CreateIndex
CREATE INDEX "CvDocument_userId_updatedAt_idx" ON "CvDocument"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "Answer_userId_questionKey_idx" ON "Answer"("userId", "questionKey");

-- CreateIndex
CREATE INDEX "Answer_userId_updatedAt_idx" ON "Answer"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApiToken_hashedToken_key" ON "ApiToken"("hashedToken");

-- CreateIndex
CREATE INDEX "ApiToken_userId_idx" ON "ApiToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SheetLink_userId_key" ON "SheetLink"("userId");

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_cvDocumentId_fkey" FOREIGN KEY ("cvDocumentId") REFERENCES "CvDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationEvent" ADD CONSTRAINT "ApplicationEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CvDocument" ADD CONSTRAINT "CvDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SheetLink" ADD CONSTRAINT "SheetLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every offer already marked "applied" becomes a tracked application.
-- urlKey = lowercased host without "www." + path without query, hash or trailing slash
-- (the same rule as urlKey() in src/server/applications/service.ts).
INSERT INTO "Application" ("id", "userId", "jobId", "company", "title", "url", "urlKey", "location", "status", "appliedAt", "statusChangedAt", "source", "createdAt", "updatedAt")
SELECT
    'bf' || substr(md5(f."id"), 1, 23),
    f."userId",
    f."jobId",
    c."name",
    j."title",
    j."originalUrl",
    lower(regexp_replace(regexp_replace(regexp_replace(j."originalUrl", '^[a-zA-Z]+://(www\.)?', ''), '[?#].*$', ''), '/+$', '')),
    j."locationText",
    'APPLIED',
    f."updatedAt",
    f."updatedAt",
    'nowarola',
    f."updatedAt",
    CURRENT_TIMESTAMP
FROM "OfferFeedback" f
JOIN "Job" j ON j."id" = f."jobId"
JOIN "Company" c ON c."id" = j."companyId"
WHERE f."verdict" = 'APPLIED';

INSERT INTO "ApplicationEvent" ("id", "applicationId", "type", "toStatus", "channel", "at")
SELECT 'bfe' || substr(md5(a."id"), 1, 22), a."id", 'created', 'APPLIED', 'web', a."appliedAt"
FROM "Application" a
WHERE a."id" LIKE 'bf%';
