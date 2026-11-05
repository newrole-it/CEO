-- CreateTable
CREATE TABLE "GmailLink" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "autoApply" BOOLEAN NOT NULL DEFAULT true,
    "useModel" BOOLEAN NOT NULL DEFAULT true,
    "cursorAt" TIMESTAMP(3),
    "nextSyncAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "syncingAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastStats" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GmailLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailEvent" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "messageId" TEXT NOT NULL,
    "applicationId" TEXT,
    "fromAddress" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "signal" TEXT NOT NULL,
    "reader" TEXT NOT NULL,
    "evidence" TEXT,
    "outcome" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "company" TEXT,
    "title" TEXT,
    "authenticated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GmailLink_userId_key" ON "GmailLink"("userId");

-- CreateIndex
CREATE INDEX "GmailLink_nextSyncAt_idx" ON "GmailLink"("nextSyncAt");

-- CreateIndex
CREATE INDEX "MailEvent_userId_outcome_receivedAt_idx" ON "MailEvent"("userId", "outcome", "receivedAt");

-- CreateIndex
CREATE INDEX "MailEvent_applicationId_idx" ON "MailEvent"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "MailEvent_userId_messageId_key" ON "MailEvent"("userId", "messageId");

-- AddForeignKey
ALTER TABLE "GmailLink" ADD CONSTRAINT "GmailLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailEvent" ADD CONSTRAINT "MailEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailEvent" ADD CONSTRAINT "MailEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;
